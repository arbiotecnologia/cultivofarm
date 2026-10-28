"""Offline only: reject non-disposable socket. Requires psycopg2-binary."""
import sys,json,re,psycopg2
socket,port,*mode=sys.argv[1:]
assert socket.startswith('/tmp/billing-') and port=='55538'
c=psycopg2.connect(host=socket,port=port,user='postgres',dbname='postgres',connect_timeout=5)
c.autocommit=True
def run(q):
 q=re.sub(r'^\\set .*\n','',q,flags=re.M)
 if not q.strip():return
 try:
  with c.cursor() as cur:
   cur.execute(q)
   if cur.description:
    for row in cur.fetchall(): print('|'.join('t' if v is True else 'f' if v is False else '' if v is None else json.dumps(v) if isinstance(v,(dict,list)) else str(v) for v in row),flush=True)
 except psycopg2.Error as e:
  print(str(e.pgcode)+' '+str(e),file=sys.stderr,flush=True)
  if not mode:sys.exit(1)
if mode:
 for line in sys.stdin:run(line)
else:run(sys.stdin.read())
c.close()
