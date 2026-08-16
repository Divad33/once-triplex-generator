#!/usr/bin/env python3
import asyncio, json, re
from datetime import datetime, timedelta
from pathlib import Path
import aiohttp
from bs4 import BeautifulSoup

OUTPUT = Path("public/once-triplex-history.json")
START = datetime(2014, 9, 29)
END = datetime.now()
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
MONTHS = {1:'enero',2:'febrero',3:'marzo',4:'abril',5:'mayo',6:'junio',
          7:'julio',8:'agosto',9:'septiembre',10:'octubre',11:'noviembre',12:'diciembre'}

def norm(m): return m.replace('á','a').replace('é','e').replace('í','i').replace('ó','o').replace('ú','u')
def build_url(d): return f"https://www.juegosonce.es/resultados-triplex-{d.day}-{norm(MONTHS[d.month])}-{d.year}"

def parse(html, date):
    soup = BeautifulSoup(html, 'html.parser')
    r = []
    for t in soup.find_all(text=re.compile(r'Triplex.*sorteo\s+(\d+)', re.I)):
        sm = re.search(r'sorteo\s+(\d+)', t, re.I)
        if not sm: continue
        s = int(sm.group(1))
        p = t.parent
        for a in [p, p.parent if p else None, p.parent.parent if p and p.parent else None]:
            if not a: continue
            for e in a.find_all(text=True):
                m = re.search(r'N[uú]meros?:\s*(\d)\s*,\s*(\d)\s*,\s*(\d)', e, re.I)
                if m:
                    r.append({"number":f"{m.group(1)}{m.group(2)}{m.group(3)}","date":date.strftime('%Y-%m-%d'),"period":f"S{s}"})
                    break
            else: continue
            break
    return r

async def fetch_day(session, date, sem):
    url = build_url(date)
    async with sem:
        try:
            async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 404: return []
                return parse(await resp.text(), date)
        except: return []
        finally: await asyncio.sleep(0.1)

async def main():
    dates = [START + timedelta(days=i) for i in range((END-START).days+1)]
    total = len(dates)
    sem = asyncio.Semaphore(10)
    all_r = []
    async with aiohttp.ClientSession() as session:
        for i in range(0, total, 10):
            batch = dates[i:i+10]
            results = await asyncio.gather(*[fetch_day(session, d, sem) for d in batch])
            for draws in results: all_r.extend(draws)
            p = min(i+10, total)
            print(f"Progreso: {p}/{total} | Sorteos: {len(all_r)}", flush=True)
            await asyncio.sleep(0.4)
    all_r.sort(key=lambda x:(x['date'],int(x['period'][1:])))
    seen=set(); uniq=[]
    for r in all_r:
        k=f"{r['date']}|{r['period']}"
        if k not in seen: seen.add(k); uniq.append(r)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT,'w',encoding='utf-8') as f: json.dump(uniq,f,indent=2,ensure_ascii=False)
    print(f"✅ COMPLETADO: {len(uniq)} sorteos")

if name=="main": asyncio.run(main())
