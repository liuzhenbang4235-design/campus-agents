from rapidocr_onnxruntime import RapidOCR
from pathlib import Path
import json
ocr=RapidOCR()
root=Path(r'C:\Users\31303\Downloads\通达agent图库\食堂')
out=[]
for i,p in enumerate(sorted(root.glob('*.jpeg')),1):
    try:
      res,_=ocr(str(p))
      lines=[]
      if res:
       for row in res:
        if len(row)>=3:
         txt,score=row[1],row[2]
         if score>=0.35: lines.append({'text':txt,'score':round(float(score),3)})
      out.append({'index':i,'fileName':p.name,'lines':lines})
      print(i,len(lines))
    except Exception as e: out.append({'index':i,'fileName':p.name,'error':str(e)})
Path(r'C:\Users\31303\Documents\Codex\2026-09-23\new-chat\outputs\campus-agent\imports\canteen-ocr-2026-10-11.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
