import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from ingestor import ingest_file
import pandas as pd

try:
    df = ingest_file('test.csv')
    print("Ingest success, rows:", len(df))
    from analyzer import analyze_trades
    import asyncio
    
    async def run_analysis():
        metrics = await analyze_trades(df, None)
        print("Analyze success!")
        print(metrics)
        
    asyncio.run(run_analysis())
except Exception as e:
    import traceback
    traceback.print_exc()
