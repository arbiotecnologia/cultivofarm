"""Builds paracatu-mg-2026-2027.json (v2). 2026 entries copied verbatim from the
immutable v1 dataset; 2027 computed from recurring laws in force consulted
2026-10-29 (NOT a published annual calendar; no guarantee against future
legislation). Easter by the anonymous Gregorian (Meeus/Jones/Butcher) algorithm;
the engine test re-verifies with an independent Gauss formulation."""
import datetime, hashlib, json, pathlib
H = pathlib.Path(__file__).parent
def easter(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mo = (h + l - 7 * m + 114) // 31
    return datetime.date(y, mo, (h + l - 7 * m + 114) % 31 + 1)
v1 = json.loads((H / 'paracatu-mg-2026.json').read_text(encoding='utf-8'))
E = easter(2027); TD = datetime.timedelta
L662 = 'Lei federal 662/1949 art. 1º, red. Lei 10.607/2002'
FIX = [('01-01', 'Confraternização Universal', 'national', L662), ('04-21', 'Tiradentes', 'national', L662),
       ('05-01', 'Dia do Trabalho', 'national', L662), ('06-13', 'Santo Antônio (padroeiro)', 'municipal', 'Lei municipal 2.383/2001 art. 1º I'),
       ('09-07', 'Independência do Brasil', 'national', L662), ('10-12', 'Nossa Senhora Aparecida', 'national', 'Lei federal 6.802/1980'),
       ('10-20', 'Aniversário de Paracatu', 'municipal', 'Lei municipal 2.579/2005'), ('10-31', 'Dia da Reforma', 'municipal', 'Lei municipal 2.383/2001 art. 1º II'),
       ('11-02', 'Finados', 'national', L662), ('11-15', 'Proclamação da República', 'national', L662),
       ('11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'national', 'Lei federal 14.759/2023'), ('12-25', 'Natal', 'national', L662)]
h27 = [dict(date='2027-' + md, name=n, scope=s, legal_basis=b, classification='FERIADO', origin='RECURRING_LAW_COMPUTED') for md, n, s, b in FIX]
h27 += [dict(date=(E - TD(2)).isoformat(), name='Sexta-feira da Paixão', scope='municipal', legal_basis='Lei municipal 2.383/2001 art. 1º IV; Páscoa-2 (computus gregoriano)', classification='FERIADO', origin='RECURRING_LAW_COMPUTED_MOVABLE'),
        dict(date=(E + TD(60)).isoformat(), name='Corpus Christi', scope='municipal', legal_basis='Lei municipal 2.383/2001 art. 1º III red. Lei 3.227/2016; Páscoa+60', classification='FERIADO', origin='RECURRING_LAW_COMPUTED_MOVABLE')]
h27.sort(key=lambda x: x['date'])
h26 = [dict(h, origin='ANNUAL_DECREE_8035_2025_AND_LAWS') for h in v1['data']['holidays']]
data = dict(holidays=h26 + h27,
            excluded_optional_points=v1['data']['excluded_optional_points'],
            explicitly_not_holiday=v1['data']['explicitly_not_holiday'] + [dict(date='2027-12-08', name='Imaculada Conceição', reason='Lei 3.227/2016 substituiu no inciso III da Lei 2.383/2001 por Corpus Christi')],
            optional_points_2027='NOT_LISTED: nenhum ponto facultativo 2027 entra; facultativos nunca são feriados (dias úteis)')
src = v1['sources'] + [
    dict(id='lei-662-1949-atualizada', url='https://www2.camara.leg.br/legin/fed/lei/1940-1949/lei-662-6-abril-1949-347136-normaatualizada-pl.html', note='texto atualizado (red. 10.607/2002): 01/01, 21/04, 01/05, 07/09, 02/11, 15/11, 25/12'),
    dict(id='lei-662-presidencia', url='https://legislacao.presidencia.gov.br/atos/?ano=1949&ato=3deoXUE5EMBRVT165&numero=662&tipo=LEI', note='indicado pelo proprietário; fetch automatizado bloqueado'),
    dict(id='lei-6802-1980', url='https://www2.camara.leg.br/legin/fed/lei/1980-1987/lei-6802-30-junho-1980-357065-publicacaooriginal-1-pl.html'),
    dict(id='lei-14759-2023', url='https://presidencia.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm', note='texto confirmado via índice oficial planalto.gov.br'),
    dict(id='lei-2383-2001', url='https://cmparacatu.gwlegis.com.br/html/norma-juridica/3/completo', note='13/06, 31/10, (08/12 alterado), Sexta da Paixão'),
    dict(id='cnj-portaria-6544', url='https://atos.cnj.jus.br/atos/detalhar/6544', note='SOMENTE corroboração de Páscoa 2027 (26/03 dentro da Semana Santa; Corpus 27/05); recessos/feriados forenses NÃO importados')]
doc = dict(schema='cultivofarm.holiday-calendar.v1', version='paracatu-mg-2026-2027-v2', locality='Paracatu-MG', kind='REAL_OFFICIAL_SOURCES',
           coverage_start='2026-01-01', coverage_end='2027-12-31', consulted_on='2026-10-29', sources=src, data=data,
           supersedes='paracatu-mg-2026-v1 (preserved immutable)',
           origin_2027='Cálculo pelas leis recorrentes vigentes consultadas em 2026-10-29; não é calendário anual publicado nem garantia contra legislação futura',
           scope_note=v1['scope_note'])
F = ('schema', 'version', 'locality', 'kind', 'coverage_start', 'coverage_end', 'consulted_on', 'sources', 'data')
doc['integrity'] = dict(algorithm=v1['integrity']['algorithm'], fields=list(F),
    sha256=hashlib.sha256(json.dumps({k: doc[k] for k in F}, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest())
(H / 'paracatu-mg-2026-2027.json').write_text(json.dumps(doc, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
print(E, len(h27))
