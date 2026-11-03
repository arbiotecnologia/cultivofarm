from decimal import Decimal, ROUND_HALF_UP, localcontext
import json
from pathlib import Path
vectors=[]
with localcontext() as c:
 c.prec=70
 for principal in ['10000','60000','0.99','99999.99']:
  for percent in ['0','1.8','2','3.25']:
   for count in [1,2,3]:
    balance=Decimal(principal)*100; rate=Decimal(percent)/100
    nominal=balance/count if not rate else balance*rate/(1-(1+rate)**(-count))
    rows=[]
    for i in range(count):
     interest=(balance*rate).quantize(Decimal('1'),rounding=ROUND_HALF_UP)
     amount=balance+interest if i==count-1 else nominal.quantize(Decimal('1'),rounding=ROUND_HALF_UP)
     amort=amount-interest;balance-=amort
     rows.append({'amount_cents':int(amount),'interest_cents':int(interest),'principal_cents':int(amort),'balance_cents':int(balance)})
    vectors.append({'principal':principal,'monthly_percent':percent,'count':count,'rows':rows})
Path('docs/correcoes-b2b-arbio-20261031-evidencias/revisao-0230/price-decimal-oracle.json').write_text(json.dumps({'kind':'INDEPENDENT_PYTHON_DECIMAL_SYNTHETIC_NOT_COMMERCIAL','rounding':'ROUND_HALF_UP per period, last residual','vectors':vectors},indent=2)+'\n')
print(len(vectors),'vetores Decimal independentes')
