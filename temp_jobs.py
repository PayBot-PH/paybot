import json, urllib.request
run_id='26418879486'
base=f'https://api.github.com/repos/PayBot-PH/paybot/actions/runs/{run_id}/jobs'
headers={'User-Agent':'python-urllib/3','Accept':'application/vnd.github+json'}
req=urllib.request.Request(base, headers=headers)
with urllib.request.urlopen(req) as resp:
    data=json.load(resp)
print('total_count', data.get('total_count'))
for job in data.get('jobs', []):
    print('job', job['id'], job['name'], job['status'], job['conclusion'], job.get('logs_url'))
