import urllib.request
import urllib.error
url='https://api.github.com/repos/PayBot-PH/paybot/actions/jobs/77769192044/logs'
req=urllib.request.Request(url, headers={'User-Agent':'python-urllib/3','Accept':'application/vnd.github+json'})
try:
    with urllib.request.urlopen(req) as resp:
        data=resp.read()
        print('status', resp.status)
        print('len', len(data))
        print(data[:200])
except urllib.error.HTTPError as e:
    print('http', e.code)
    print(e.read()[:500])
except Exception as e:
    print('err', e)
