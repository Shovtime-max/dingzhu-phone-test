import importlib.util, pathlib, json, threading, urllib.request, urllib.error, os, tempfile, contextlib, io
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('geo_fixed',ROOT.parent/'geo-server.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
results=[]
testdir=tempfile.TemporaryDirectory(dir=ROOT,prefix='proxy-regression-')
m.KEY_FILE=str(pathlib.Path(testdir.name)/'key.txt');m.CACHE_FILE=str(pathlib.Path(testdir.name)/'cache.json')
m.KEY='';m.verify_key=lambda k:(True,'')
server=m.ThreadingHTTPServer(('127.0.0.1',0),m.Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:%s'%server.server_port
def request(path,body=None,origin='http://127.0.0.1:4173',token=None,ctype='application/json',method=None,extra=None):
    headers={'Content-Type':ctype}
    if origin is not None:headers['Origin']=origin
    if token is not None:headers['X-Geo-Token']=token
    if extra:headers.update(extra)
    req=urllib.request.Request(base+path,data=body,headers=headers,method=method)
    try:r=urllib.request.urlopen(req,timeout=3)
    except urllib.error.HTTPError as e:r=e
    with r:
        raw=r.read()
        return r.status,dict(r.headers),json.loads(raw) if raw else None
def check(name,fn):
    try:fn();results.append({'name':name,'status':'passed'})
    except Exception as e:results.append({'name':name,'status':'failed','error':repr(e)})
def healthy():
    code,h,b=request('/health');assert code==200 and b['ok'] and not b['key']
    code,h,b=request('/route?origin=119,35&dest=119.1,35.1');assert code==200 and b['source']=='none'
    assert 'token' not in b
check('健康检查及无 Key 路由降级保持正常',healthy)
def trusted_session():
    code,h,b=request('/session');assert code==200 and b['token']==m.SESSION_TOKEN
    assert h['Access-Control-Allow-Origin']=='http://127.0.0.1:4173'
check('允许的页面可获取配置会话',trusted_session)
def blocked_origin():
    for origin in ['http://untrusted.example','null',None]:
        m.KEY='old-test-key'
        code,h,b=request('/key',b'{"key":""}',origin=origin,token=m.SESSION_TOKEN,ctype='text/plain')
        assert code==403 and m.KEY=='old-test-key'
        code,h,b=request('/session',origin=origin);assert code==403
check('任意网站、file 来源及无 Origin 请求不能配置 Key',blocked_origin)
def blocked_token():
    for token in [None,'wrong']:
        code,h,b=request('/key',b'{"key":""}',token=token);assert code==403
    # 非 ASCII 头：本机 Python 3.13 的 urllib 发不出含非 ASCII 的头（换任意 403 服务端都会 RemoteDisconnected），
    # 改用裸 socket 发原始字节，验证代理确实按 isascii 拒绝，而不是靠客户端拦掉
    import socket as _socket
    c=_socket.create_connection(('127.0.0.1',server.server_port),3)
    c.sendall(('POST /key HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nOrigin: http://127.0.0.1:4173\r\n'
               'Content-Type: application/json\r\nX-Geo-Token: \u00e9\r\nContent-Length: 10\r\n\r\n{"key":""}'
               % server.server_port).encode('latin-1'))
    raw=c.recv(4096);c.close()
    assert b' 403 ' in raw
check('缺失、错误及非 ASCII 会话凭证均拒绝',blocked_token)
def blocked_host():
    code,h,b=request('/health',extra={'Host':'untrusted.example'});assert code==403
check('拒绝非本机 Host',blocked_host)
def body_validation():
    code,h,b=request('/key',b'{"key":""}',token=m.SESSION_TOKEN,ctype='text/plain');assert code==415
    for raw in [b'[]',b'{',b'{"key":12}',b'{"key":null}',b'x'*4097]:
        code,h,b=request('/key',raw,token=m.SESSION_TOKEN);assert code==400
    code,h,b=request('/key',b'{"key":""}',token=m.SESSION_TOKEN,extra={'Content-Length':'-1'});assert code==400
check('错误内容类型、正文结构和长度均拒绝',body_validation)
def key_write():
    code,h,b=request('/key',json.dumps({'key':'a'*32}).encode(),token=m.SESSION_TOKEN)
    assert code==200 and b['ok'] and m.KEY=='a'*32
    assert pathlib.Path(m.KEY_FILE).read_text().strip().endswith('a'*32)
    assert os.stat(m.KEY_FILE).st_mode & 0o077 == 0
    code,h,b=request('/key',b'{"key":""}',token=m.SESSION_TOKEN)
    assert b['ok'] and not m.KEY and not pathlib.Path(m.KEY_FILE).exists()
check('合法配置可保存、清除且 Key 文件仅属主可读写',key_write)
def failed_write():
    before=m.KEY_FILE;m.KEY_FILE=testdir.name;m.KEY='old-test-key'
    try:
        b=m.set_key('b'*32);assert not b['ok'] and m.KEY=='old-test-key'
    finally:m.KEY_FILE=before
check('Key 落盘失败不改变运行配置',failed_write)
def env_priority():
    original=os.environ.get('AMAP_KEY');os.environ['AMAP_KEY']='environment-test';m.KEY='environment-test'
    try:
        b=m.set_key('');assert b['error']=='environment' and m.KEY=='environment-test'
    finally:
        if original is None:os.environ.pop('AMAP_KEY',None)
        else:os.environ['AMAP_KEY']=original
check('环境变量 Key 不会被页面伪清除',env_priority)
def race():
    m._cache={};errors=io.StringIO()
    with contextlib.redirect_stderr(errors):
        workers=[threading.Thread(target=m.cache_put,args=('route',str(i),{'ok':True,'n':i})) for i in range(30)]
        for t in workers:t.start()
        for t in workers:t.join()
    assert '失败' not in errors.getvalue()
    disk=json.loads(pathlib.Path(m.CACHE_FILE).read_text());assert len(disk)==30
    assert all(disk['route|'+str(i)]['v']['n']==i for i in range(30))
check('30 个并发缓存写入全部持久化且 JSON 有效',race)
def provider_recovery():
    m._cache={};m.KEY='test-key'
    m.amap_search=lambda *args:(_ for _ in ()).throw(RuntimeError('temporary outage'))
    m.photon_search=lambda *args:[{'name':'osm-test'}]
    a=m.do_poi({'keywords':'村','lat':'35','lng':'119'})
    m.amap_search=lambda *args:[{'name':'amap-recovered'}]
    b=m.do_poi({'keywords':'村','lat':'35','lng':'119'})
    assert a['source']=='osm' and b['source']=='amap'
check('高德故障恢复后可立即升级来源',provider_recovery)
def invalid_coord():
    for lat,lng in [('nan','119'),('91','119'),('35','181')]:
        b=m.do_poi({'keywords':'村','lat':lat,'lng':lng});assert b['source']=='none' and b['items']==[]
check('非法坐标不会进入上游或缓存',invalid_coord)
def preflight():
    code,h,b=request('/key',method='OPTIONS');assert code==204
    assert 'POST' in h['Access-Control-Allow-Methods'] and 'X-Geo-Token' in h['Access-Control-Allow-Headers']
check('合法页面的配置预检允许 POST 与会话凭证',preflight)
def nearby_sorted():
    m.KEY='test-key';m._cache={}
    m.amap=lambda path,params:{"status":"1","pois":[
        {"name":"测试县远村","location":"118.95,35.93","distance":"5200","adname":"测试县","cityname":"测试市","pname":"测试省","typecode":"190100"},
        {"name":"测试县近村","location":"118.99,35.91","distance":"800","adname":"测试县","cityname":"测试市","pname":"测试省","typecode":"190100"},
        {"name":"半径外","location":"120.50,36.50","distance":"60000"}]}
    b=m.do_nearby({"lat":"35.905","lng":"118.98","radius":"15000"})
    assert b["source"]=="amap" and [i["name"] for i in b["items"]]==["测试县近村","测试县远村"]
    assert b["items"][0]["addr"].startswith("测试省测试市测试县")
check('附近村庄按距离排序且超出半径不入结果',nearby_sorted)
def nearby_guard():
    m._cache={}
    b=m.do_nearby({"lat":"91","lng":"118.9"});assert b["source"]=="none" and b["error"]=="invalid_location"
    b=m.do_nearby({"lng":"118.9"});assert b["source"]=="none"
    m.KEY=''
    b=m.do_nearby({"lat":"35.9","lng":"118.9"});assert b["source"]=="none" and b["reason"]=="no_key"
check('非法坐标或无 Key 时附近查询不返回假结果',nearby_guard)
def poi_radius():
    m.KEY='test-key';m._cache={}
    m.amap_search=lambda kw,lat,lon:[{"name":"近村","dist":2.0,"lat":35.9,"lng":118.99},
                                     {"name":"远村","dist":80.0,"lat":36.5,"lng":119.9}]
    a=m.do_poi({"keywords":"村","lat":"35.905","lng":"118.98"})
    assert [i["name"] for i in a["items"]]==["近村"] and a["widened"] is False
    m._cache={}
    m.amap_search=lambda kw,lat,lon:[{"name":"很远","dist":80.0,"lat":36.5,"lng":119.9}]
    b=m.do_poi({"keywords":"村","lat":"35.905","lng":"118.98"})
    assert [i["name"] for i in b["items"]]==["很远"] and b["widened"] is True
check('搜索结果按半径收口，附近为空才放宽',poi_radius)
server.shutdown();server.server_close();testdir.cleanup()
(ROOT/'regression-proxy-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps({'passed':sum(x['status']=='passed' for x in results),'total':len(results),'failures':[x for x in results if x['status']=='failed']},ensure_ascii=False,indent=2))
assert all(x['status']=='passed' for x in results)
