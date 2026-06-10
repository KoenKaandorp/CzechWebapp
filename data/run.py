import json, random
random.seed(42)
d = json.load(open('seed.json', encoding='utf-8'))
d.sort(key=lambda w: w['rank'])
for i in range(0, len(d), 30):
    chunk = d[i:i+30]; random.shuffle(chunk); d[i:i+30] = chunk
for i, w in enumerate(d): w['rank'] = i + 1
json.dump(d, open('seed.json','w',  encoding='utf-8'), ensure_ascii=False, indent=2)
print("dsaf")