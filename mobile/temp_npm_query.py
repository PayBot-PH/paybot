import urllib.request, json
url = 'https://registry.npmjs.org/metro-react-native-babel-preset'
req = urllib.request.Request(url, headers={'User-Agent': 'python-urllib/3'})
with urllib.request.urlopen(req) as resp:
    data = json.load(resp)
print(sorted(data['versions'].keys())[-10:])
