#!/usr/bin/env python3
import asyncio, json, re
from datetime import datetime, timedelta
from pathlib import Path
import aiohttp
from bs4 import BeautifulSoup

OUTPUT_FILE = Path("public/once-triplex-history.json")
START_DATE = datetime(2014, 9, 29)
END_DATE = datetime.now()
CONCURRENT_REQUESTS = 10
DELAY_BETWEEN_BATCHES = 0.4

MONTHS_SLUG = {1:'enero',2:'febrero',3:'marzo',4:'abril',5:'mayo',6:'junio',
               7:'julio',8:'agosto',9:'septiembre',10:'octubre',11:'noviembre',12:'diciembre'}
SORTEO_MAP = {'primer':1,'primero':1,'segundo':2,'tercer':3,'tercero':3,'cuarto':4,'quinto':5}

HEADERS = {'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
           'Accept-Language':'es-ES,es;q=0.9'}

def norm(m): return m.replace('á','a').replace('é','e').replace('í','i').replace('ó','o').replace('ú','u').replace('ñ','n')
def build_url(d): return f"https://www.juegosonce.es/resultados-triplex-{d.day}-{norm(MONTHS_SLUG[d.month])}-{d.year}"

def parse_draws(html, date):
    soup = BeautifulSoup(html, 'html.parser')
    r = []
    pattern = re.compile(r'N[uú]meros para el\s+(\w+)\s+sorteo del Triplex:\s*(\d)\s*,\s*(\d)\s*,\s*(\d)', re.I)
    for text in soup.find_all(text=True):
        m = pattern.search(text)
        if m:
            s = SORTEO_MAP.get(m.group(1).lower())
            if s is None: continue
            r.append({"number":f"{m.group(2)}{m.group(3)}{m.group(4)}","date":date.strftime('%Y-%m-%d'),"period":f"S{s}"})
    return r

async def fetch_day(session, date, sem):
    url = build_url(date)
    async with sem:
        try:
            async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 404: return []
                return parse_draws(await resp.text(), date)
        except: return []
        finally: await asyncio.sleep(0.1)

async def main():
    dates = [START_DATE + timedelta(days=i) for i in range((END_DATE-START_DATE).days+1)]
    total = len(dates)
    sem = asyncio.Semaphore(CONCURRENT_REQUESTS)
    all_r = []
    async with aiohttp.ClientSession() as session:
        for i in range(0, total, CONCURRENT_REQUESTS):
            batch = dates[i:i+CONCURRENT_REQUESTS]
            results = await asyncio.gather(*[fetch_day(session, d, sem) for d in batch])
            for draws in results: all_r.extend(draws)
            p = min(i+CONCURRENT_REQUESTS, total)
            print(f"Progreso: {p}/{total} | Sorteos: {len(all_r)}", flush=True)
            await asyncio.sleep(DELAY_BETWEEN_BATCHES)
    all_r.sort(key=lambda x:(x['date'],int(x['period'][1:])))
    seen=set(); uniq=[]
    for r in all_r:
        k=f"{r['date']}|{r['period']}"
        if k not in seen: seen.add(k); uniq.append(r)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE,'w',encoding='utf-8') as f: json.dump(uniq,f,indent=2,ensure_ascii=False)
    print(f"\n✅ COMPLETADO: {len(uniq)} sorteos")

if __name__=="__main__": asyncio.run(main())
