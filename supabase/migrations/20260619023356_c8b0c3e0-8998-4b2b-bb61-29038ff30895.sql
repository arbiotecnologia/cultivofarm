
-- =====================================================================
-- FASE 7 — Inserção idempotente das fichas iniciais dos 24 microrganismos
-- - Não cria estrutura, não cria microrganismo novo, não aprova ficha.
-- - Preserva fichas aprovadas e campos já preenchidos (COALESCE).
-- - Alvos e fontes sem duplicidade.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) FICHAS TÉCNICAS (microorganism_technical_profiles)
-- ---------------------------------------------------------------------
DO $fase7$
DECLARE
  v_compat   text := 'Evitar misturas sem teste prévio de compatibilidade. Avaliar pH da calda, qualidade da água, defensivos químicos, sais, fertilizantes e condições de aplicação. Produtos biológicos podem apresentar sensibilidade a fungicidas, bactericidas, radiação solar intensa, temperatura elevada e armazenamento inadequado.';
  v_armaz    text := 'Armazenar conforme orientação técnica da AR Bio, protegido de calor excessivo, luz solar direta e contaminação. Manter embalagem fechada e respeitar validade, lote e recomendações de transporte.';
  v_obsreg   text := 'As recomendações de bioinsumos exigem avaliação técnica e prescrição agronômica conforme cultura, alvo, ambiente, histórico da área e manejo adotado. As informações desta ficha são apoio técnico e não substituem recomendação profissional.';
  v_indic    text := 'Aplicação conforme prescrição agronômica, ajustada por cultura, fase fenológica, alvo, histórico da área e condições ambientais. Respeitar dose, volume de calda e janela de aplicação recomendados pelo responsável técnico.';
  v_cuid     text := 'Aplicar nas horas mais frescas do dia, evitar mistura com produtos incompatíveis, utilizar água de boa qualidade, respeitar EPI e validar viabilidade do produto antes da aplicação.';
  v_mid      uuid;
  r          record;
  v_existing record;
BEGIN
  -- Tabela temporária com a carga das 24 fichas
  CREATE TEMP TABLE _fase7_fichas (
    nome_cientifico text,
    resumo_curto text,
    mecanismo_acao text,
    beneficios_agronomicos text,
    explicacao_tecnica text,
    explicacao_produtor text,
    explicacao_b2b text
  ) ON COMMIT DROP;

  INSERT INTO _fase7_fichas VALUES
  ('Bacillus amyloliquefaciens',
   'Bactéria benéfica utilizada no manejo biológico de doenças e no fortalecimento da raiz. Pode auxiliar na proteção da planta e no equilíbrio microbiológico do solo.',
   'Colonização da rizosfera, competição com patógenos, produção de compostos antimicrobianos, estímulo ao crescimento radicular e suporte à defesa vegetal.',
   'Proteção radicular, redução de pressão de doenças de solo, maior vigor inicial, equilíbrio microbiológico e apoio ao manejo preventivo.',
   'Função: fungicida, bactericida, promotor de crescimento e equilíbrio da rizosfera. Atua via colonização radicular, biofilme, competição por nicho e produção de metabólitos antimicrobianos.',
   'Ajuda a proteger a raiz e o solo, deixando a planta mais forte contra doenças e com melhor pegamento inicial.',
   'Bioinsumo bacteriano de amplo uso no manejo preventivo de doenças de solo e estímulo radicular. Indicado em programas biológicos integrados.'),
  ('Bacillus aryabhattai',
   'Microrganismo associado à maior resiliência da planta em condições adversas, especialmente em períodos de estresse hídrico.',
   'Atua na rizosfera favorecendo desenvolvimento radicular, equilíbrio fisiológico e melhor resposta da planta a condições de limitação hídrica.',
   'Maior vigor, melhor adaptação ao estresse, suporte ao crescimento inicial e melhor exploração do solo pelas raízes.',
   'Função: tolerância a estresse hídrico e promoção de crescimento. Atua via colonização radicular e estímulo ao desenvolvimento do sistema de raízes.',
   'Auxilia a planta a enfrentar melhor períodos de seca, com raízes mais desenvolvidas.',
   'Bioinsumo indicado em programas de manejo de estresse hídrico e promoção de crescimento.'),
  ('Bacillus licheniformis',
   'Bactéria utilizada para auxiliar na disponibilização de fósforo e melhorar a eficiência nutricional da cultura.',
   'Atua na rizosfera favorecendo a conversão de formas pouco disponíveis de fósforo em formas mais aproveitáveis pelas plantas.',
   'Melhor aproveitamento da adubação fosfatada, maior desenvolvimento radicular, melhor arranque inicial e suporte ao crescimento.',
   'Função: solubilização de fósforo e promoção de crescimento. Atua via produção de ácidos orgânicos e enzimas que disponibilizam P.',
   'Ajuda a aproveitar melhor o adubo com fósforo, melhorando o pegamento inicial.',
   'Bioinsumo indicado em estratégias de eficiência nutricional, especialmente em P.'),
  ('Bacillus megaterium',
   'Microrganismo com potencial para melhorar a disponibilidade de fósforo no solo e contribuir para o crescimento inicial da cultura.',
   'Produção de compostos associados à solubilização de fósforo e estímulo à atividade biológica na rizosfera.',
   'Melhor eficiência do fósforo, maior desenvolvimento de raiz, melhor estabelecimento da cultura e suporte nutricional.',
   'Função: solubilização de fósforo. Atua via liberação de ácidos orgânicos e fosfatases na rizosfera.',
   'Ajuda a planta a aproveitar melhor o fósforo do solo, com raiz mais desenvolvida.',
   'Bioinsumo para programas de eficiência fosfatada e biologização de solo.'),
  ('Bacillus methylotrophicus',
   'Bactéria benéfica voltada ao manejo biológico de doenças e proteção do sistema radicular.',
   'Colonização da região da raiz, competição com microrganismos indesejáveis e produção de metabólitos associados ao biocontrole.',
   'Redução de pressão de doenças, proteção radicular, equilíbrio da microbiota e suporte ao vigor da planta.',
   'Função: fungicida, bactericida e equilíbrio microbiológico. Atua via colonização radicular e produção de metabólitos antimicrobianos.',
   'Ajuda a proteger as raízes e reduzir doenças do solo, equilibrando a microbiota.',
   'Bioinsumo para manejo biológico de doenças de solo e equilíbrio rizosférico.'),
  ('Bacillus pumilus',
   'Bactéria utilizada como ferramenta de apoio ao manejo preventivo de doenças e ao crescimento vegetal.',
   'Competição com patógenos, colonização radicular, produção de compostos bioativos e estímulo indireto à sanidade da planta.',
   'Maior sanidade vegetal, proteção preventiva, vigor inicial e apoio ao manejo biológico.',
   'Função: fungicida e promotor de crescimento. Atua via colonização e produção de metabólitos com atividade antifúngica.',
   'Apoia a sanidade da planta e o crescimento inicial, prevenindo doenças.',
   'Bioinsumo para manejo preventivo e promoção de crescimento.'),
  ('Bacillus subtilis',
   'Uma das bactérias mais utilizadas em programas biológicos, com atuação sobre sanidade, raiz e equilíbrio da rizosfera.',
   'Colonização de raízes, formação de biofilme, competição com patógenos, produção de compostos antimicrobianos e estímulo à defesa natural da planta.',
   'Proteção contra doenças, melhor desenvolvimento radicular, maior vigor e suporte à resistência da planta.',
   'Função: fungicida, promotor de crescimento e indutor de resistência. Forma biofilme e libera lipopeptídeos antimicrobianos.',
   'Forma uma barreira na raiz que protege a planta de doenças e estimula o crescimento.',
   'Bioinsumo de referência em programas biológicos integrados, com amplo respaldo técnico.'),
  ('Bacillus thuringiensis aizawai',
   'Bactéria utilizada no manejo biológico de lagartas, especialmente dentro de programas de manejo integrado de pragas.',
   'Ação por ingestão, com produção de proteínas e metabólitos que afetam o sistema digestivo de lagartas suscetíveis.',
   'Controle biológico de lagartas, seletividade, redução de pressão de desfolhadores e apoio ao MIP.',
   'Função: inseticida biológico para lagartas. Atua via cristais proteicos Cry/Vip ativados no intestino do alvo.',
   'Atua contra lagartas quando a praga se alimenta da planta tratada.',
   'Bioinsumo para MIP de lepidópteros, com bom perfil de seletividade.'),
  ('Bacillus thuringiensis kurstaki',
   'Bactéria usada no controle biológico de lepidópteros, com ação direcionada principalmente a lagartas.',
   'Age por ingestão, afetando o trato digestivo das lagartas e contribuindo para redução da população do alvo.',
   'Manejo de lagartas, seletividade, integração com controle biológico e redução da dependência química.',
   'Função: inseticida biológico para lagartas. Cristais proteicos Cry específicos para lepidópteros.',
   'Controla lagartas que se alimentam da planta tratada, com baixo impacto em inimigos naturais.',
   'Bioinsumo para MIP de lagartas em diversas culturas.'),
  ('Bacillus velezensis',
   'Bactéria benéfica com aplicação no controle biológico, proteção radicular e promoção de crescimento.',
   'Produção de compostos antimicrobianos, competição com patógenos, colonização de raízes e estímulo ao desenvolvimento vegetal.',
   'Redução de doenças, maior sanidade de raiz, crescimento mais uniforme e equilíbrio microbiológico.',
   'Função: fungicida, bactericida e promotor de crescimento. Produz lipopeptídeos e poliketídeos antimicrobianos.',
   'Protege raízes contra doenças e ajuda no crescimento mais uniforme da lavoura.',
   'Bioinsumo de alto desempenho em programas biológicos integrados.'),
  ('Beauveria bassiana',
   'Fungo entomopatogênico usado no manejo biológico de diferentes insetos-praga.',
   'Infecta insetos por contato, germina sobre a cutícula, penetra no hospedeiro e reduz sua sobrevivência.',
   'Controle de pragas, apoio ao manejo integrado, redução de pressão populacional e menor impacto sobre o equilíbrio biológico.',
   'Função: inseticida biológico. Conídios germinam sobre a cutícula e colonizam o hospedeiro.',
   'Mata o inseto por contato, ideal para programas de manejo integrado.',
   'Bioinsumo para MIP de sugadores, brocas e pragas de solo.'),
  ('Chromobacterium subtsugae',
   'Bactéria com potencial para manejo biológico de insetos-praga e apoio em estratégias contra nematoides.',
   'Produção de metabólitos bioativos associados à atividade inseticida e suporte ao manejo biológico de pragas.',
   'Redução de pressão de insetos, apoio ao controle de pragas difíceis e integração com outras ferramentas biológicas.',
   'Função: inseticida e nematicida. Atua via metabólitos secundários.',
   'Ajuda no controle de pragas difíceis e na pressão de nematoides.',
   'Bioinsumo complementar em programas de MIP e nematoides.'),
  ('Cordyceps javanica',
   'Fungo entomopatogênico indicado para manejo de pragas sugadoras e alguns ácaros.',
   'Infecta o inseto ou ácaro por contato, coloniza o hospedeiro e contribui para redução da população da praga.',
   'Manejo de mosca-branca, cigarrinhas, pulgões, ácaros e outras pragas sugadoras dentro do MIP.',
   'Função: inseticida e acaricida. Conídios germinam sobre a cutícula do alvo.',
   'Atua contra pragas sugadoras e ácaros por contato.',
   'Bioinsumo para MIP de sugadores e ácaros.'),
  ('E.M. (Microorganismos Eficientes)',
   'Consórcio microbiano usado para ativação biológica, decomposição de resíduos e melhoria do ambiente microbiológico.',
   'Atuação conjunta de microrganismos benéficos na decomposição de matéria orgânica, ciclagem de nutrientes e equilíbrio microbiano.',
   'Melhor decomposição de resíduos, estímulo à vida do solo, apoio à compostagem e melhoria da atividade biológica.',
   'Função: degradação de matéria orgânica e equilíbrio microbiológico. Consórcio com bactérias lácticas, leveduras e fototróficas.',
   'Acelera a decomposição da palhada e melhora a vida do solo.',
   'Bioinsumo consorciado para biologização e compostagem.'),
  ('Isaria fumosorosea',
   'Fungo entomopatogênico utilizado no manejo de pragas sugadoras e ácaros.',
   'Infecta o alvo por contato, coloniza o hospedeiro e contribui para redução da pressão populacional.',
   'Manejo biológico de mosca-branca, pulgões, cigarrinhas, ácaros e pragas de difícil controle.',
   'Função: inseticida e acaricida. Conídios penetram pela cutícula do alvo.',
   'Controla pragas sugadoras e ácaros por contato.',
   'Bioinsumo para MIP de sugadores e ácaros.'),
  ('Metarhizium anisopliae',
   'Fungo entomopatogênico amplamente utilizado no controle de pragas de solo e parte aérea.',
   'Germina sobre o inseto, penetra pela cutícula, coloniza o hospedeiro e causa redução da população da praga.',
   'Controle de cigarrinhas, pragas de solo, insetos sugadores e apoio ao manejo integrado de pragas.',
   'Função: inseticida biológico. Conídios penetram a cutícula e colonizam o hemocelo.',
   'Mata o inseto por contato, muito usado em cigarrinhas e pragas de solo.',
   'Bioinsumo de referência para MIP de cigarrinhas e pragas de solo.'),
  ('Methylobacterium symbioticum',
   'Bactéria associada ao aproveitamento complementar de nitrogênio atmosférico e ao suporte nutricional da planta.',
   'Pode atuar em associação com a planta, contribuindo para fixação biológica complementar de nitrogênio e melhor eficiência nutricional.',
   'Apoio ao manejo de nitrogênio, vigor vegetativo, melhor eficiência nutricional e suporte ao crescimento.',
   'Função: fixação biológica complementar de N atmosférico e eficiência nutricional. Não substitui totalmente a adubação nitrogenada.',
   'Ajuda a planta a aproveitar nitrogênio do ar como complemento, mas não substitui o adubo.',
   'Bioinsumo complementar em programas de manejo de N. Não promete substituição total da adubação nitrogenada.'),
  ('Paecilomyces lilacinus',
   'Fungo utilizado no manejo biológico de nematoides, especialmente associado ao parasitismo de ovos.',
   'Pode parasitar ovos e estruturas de nematoides, ajudando a reduzir a pressão populacional no solo.',
   'Proteção radicular, redução da pressão de nematoides e apoio ao manejo preventivo de áreas infestadas.',
   'Função: nematicida. Frequentemente relacionado à nomenclatura Purpureocillium lilacinum — exige validação taxonômica interna.',
   'Atua principalmente nos ovos dos nematoides, ajudando a proteger a raiz.',
   'Bioinsumo para manejo biológico de nematoides; validar taxonomia internamente.'),
  ('Pochonia chlamydosporia',
   'Fungo nematófago utilizado no manejo biológico de nematoides, principalmente pela ação sobre ovos e fêmeas.',
   'Parasitismo de ovos e estruturas de nematoides, colonização de raízes e atuação no solo como agente de biocontrole.',
   'Redução da pressão de nematoides, proteção do sistema radicular e apoio ao manejo biológico de longo prazo.',
   'Função: nematicida. Atua via parasitismo de ovos e fêmeas e colonização endofítica.',
   'Atua nos ovos e fêmeas de nematoides, ajudando a reduzir o problema ao longo do tempo.',
   'Bioinsumo para manejo biológico de nematoides com efeito de longo prazo.'),
  ('Pseudomonas fluorescens',
   'Bactéria rizosférica associada à promoção de crescimento, solubilização de nutrientes e equilíbrio microbiológico.',
   'Coloniza a rizosfera, compete com patógenos, produz compostos associados à disponibilidade de nutrientes e contribui para o vigor vegetal.',
   'Maior crescimento radicular, melhor eficiência nutricional, sanidade de rizosfera e apoio ao desenvolvimento inicial.',
   'Função: promotora de crescimento, solubilizadora e equilíbrio de rizosfera. Produz sideróforos e metabólitos antimicrobianos.',
   'Ajuda a raiz a crescer melhor e a planta a aproveitar mais nutrientes.',
   'Bioinsumo rizosférico para promoção de crescimento e sanidade.'),
  ('Purpureocillium lilacinum',
   'Fungo nematófago utilizado no manejo de nematoides fitoparasitas.',
   'Pode atuar sobre ovos e estágios de nematoides, reduzindo a pressão populacional e protegendo o sistema radicular.',
   'Redução de nematoides, proteção de raízes, melhor estabelecimento da cultura e apoio ao manejo preventivo.',
   'Função: nematicida. Parasita ovos e estágios de nematoides como Meloidogyne.',
   'Atua nos nematoides, protegendo a raiz e ajudando no estabelecimento da lavoura.',
   'Bioinsumo de referência para manejo biológico de nematoides.'),
  ('Saccharopolyspora spinosa',
   'Bactéria associada à produção de metabólitos inseticidas utilizados no manejo de pragas agrícolas.',
   'Produção de compostos bioativos com ação sobre insetos suscetíveis, contribuindo para controle biológico e manejo integrado.',
   'Apoio ao controle de insetos-praga, manejo de lagartas e tripes, redução de pressão populacional e integração com MIP.',
   'Função: inseticida. Produz espinosinas, ativas sobre lepidópteros, tripes e outros alvos.',
   'Controla lagartas e tripes via metabólitos naturais da bactéria.',
   'Bioinsumo para MIP de lagartas e tripes.'),
  ('Trichoderma asperellum',
   'Fungo benéfico usado no controle biológico de doenças de solo e no estímulo ao desenvolvimento radicular.',
   'Competição com patógenos, micoparasitismo, produção de enzimas, colonização da rizosfera e indução de resistência vegetal.',
   'Proteção contra doenças de solo, maior crescimento radicular, equilíbrio microbiológico e suporte ao vigor da planta.',
   'Função: fungicida, promotor de crescimento e equilíbrio do solo. Atua via micoparasitismo e indução de resistência sistêmica.',
   'Protege a raiz contra fungos do solo e estimula o crescimento da planta.',
   'Bioinsumo de referência em programas biológicos de solo.'),
  ('Trichoderma harzianum',
   'Fungo de solo amplamente utilizado no manejo biológico de doenças radiculares e no fortalecimento da planta.',
   'Competição por espaço e nutrientes, micoparasitismo, produção de enzimas e estímulo à defesa natural da planta.',
   'Redução de patógenos de solo, proteção radicular, maior vigor, crescimento mais uniforme e equilíbrio biológico.',
   'Função: fungicida, promotor de crescimento e proteção radicular. Atua via micoparasitismo de Fusarium, Rhizoctonia e Sclerotium.',
   'Protege a raiz contra fungos do solo e melhora o vigor da planta.',
   'Bioinsumo amplamente respaldado para doenças de solo.');

  -- Upsert idempotente
  FOR r IN SELECT * FROM _fase7_fichas LOOP
    -- Resolve microrganismo por nome_cientifico, fallback por nome
    SELECT id INTO v_mid
      FROM public.microrganismos
     WHERE lower(trim(nome_cientifico)) = lower(trim(r.nome_cientifico))
     LIMIT 1;
    IF v_mid IS NULL THEN
      SELECT id INTO v_mid
        FROM public.microrganismos
       WHERE lower(trim(nome)) = lower(trim(r.nome_cientifico))
       LIMIT 1;
    END IF;
    IF v_mid IS NULL THEN
      RAISE NOTICE 'FASE 7 — microrganismo não localizado: %', r.nome_cientifico;
      CONTINUE;
    END IF;

    SELECT * INTO v_existing
      FROM public.microorganism_technical_profiles
     WHERE microrganismo_id = v_mid;

    IF NOT FOUND THEN
      INSERT INTO public.microorganism_technical_profiles (
        microrganismo_id, resumo_curto, mecanismo_acao, beneficios_agronomicos,
        explicacao_tecnica, explicacao_produtor, explicacao_b2b,
        indicacoes_uso, cuidados_aplicacao, compatibilidade, armazenamento,
        observacoes_regulatorias, status_validacao
      ) VALUES (
        v_mid, r.resumo_curto, r.mecanismo_acao, r.beneficios_agronomicos,
        r.explicacao_tecnica, r.explicacao_produtor, r.explicacao_b2b,
        v_indic, v_cuid, v_compat, v_armaz, v_obsreg, 'em_revisao'
      );
    ELSIF v_existing.status_validacao = 'aprovado' THEN
      RAISE NOTICE 'FASE 7 — ficha já aprovada preservada: %', r.nome_cientifico;
    ELSE
      -- preenche apenas campos vazios; não rebaixa status
      UPDATE public.microorganism_technical_profiles SET
        resumo_curto             = COALESCE(NULLIF(resumo_curto,''), r.resumo_curto),
        mecanismo_acao           = COALESCE(NULLIF(mecanismo_acao,''), r.mecanismo_acao),
        beneficios_agronomicos   = COALESCE(NULLIF(beneficios_agronomicos,''), r.beneficios_agronomicos),
        explicacao_tecnica       = COALESCE(NULLIF(explicacao_tecnica,''), r.explicacao_tecnica),
        explicacao_produtor      = COALESCE(NULLIF(explicacao_produtor,''), r.explicacao_produtor),
        explicacao_b2b           = COALESCE(NULLIF(explicacao_b2b,''), r.explicacao_b2b),
        indicacoes_uso           = COALESCE(NULLIF(indicacoes_uso,''), v_indic),
        cuidados_aplicacao       = COALESCE(NULLIF(cuidados_aplicacao,''), v_cuid),
        compatibilidade          = COALESCE(NULLIF(compatibilidade,''), v_compat),
        armazenamento            = COALESCE(NULLIF(armazenamento,''), v_armaz),
        observacoes_regulatorias = COALESCE(NULLIF(observacoes_regulatorias,''), v_obsreg)
      WHERE microrganismo_id = v_mid;
    END IF;
  END LOOP;
END
$fase7$;

-- ---------------------------------------------------------------------
-- 2) ALVOS (microorganism_targets) — sem duplicidade
-- ---------------------------------------------------------------------
DO $fase7t$
DECLARE
  v_mid uuid;
  r record;
  v_prio int;
BEGIN
  CREATE TEMP TABLE _fase7_alvos (nome_cientifico text, alvo_nome text, alvo_tipo text) ON COMMIT DROP;
  INSERT INTO _fase7_alvos VALUES
  -- Bacillus amyloliquefaciens
  ('Bacillus amyloliquefaciens','Doenças de solo','doenca'),
  ('Bacillus amyloliquefaciens','Fungos fitopatogênicos','doenca'),
  ('Bacillus amyloliquefaciens','Bacterioses','doenca'),
  ('Bacillus amyloliquefaciens','Crescimento radicular','crescimento'),
  ('Bacillus amyloliquefaciens','Sanidade de solo','solo'),
  -- Bacillus aryabhattai
  ('Bacillus aryabhattai','Estresse hídrico','estresse'),
  ('Bacillus aryabhattai','Vigor inicial','crescimento'),
  ('Bacillus aryabhattai','Desenvolvimento radicular','crescimento'),
  ('Bacillus aryabhattai','Resiliência vegetal','estresse'),
  -- Bacillus licheniformis
  ('Bacillus licheniformis','Fósforo pouco disponível','nutricao'),
  ('Bacillus licheniformis','Nutrição fosfatada','nutricao'),
  ('Bacillus licheniformis','Crescimento inicial','crescimento'),
  ('Bacillus licheniformis','Raiz','crescimento'),
  -- Bacillus megaterium
  ('Bacillus megaterium','Fósforo fixado no solo','nutricao'),
  ('Bacillus megaterium','Baixa eficiência de adubação fosfatada','nutricao'),
  ('Bacillus megaterium','Crescimento radicular','crescimento'),
  ('Bacillus megaterium','Arranque inicial','crescimento'),
  -- Bacillus methylotrophicus
  ('Bacillus methylotrophicus','Doenças de solo','doenca'),
  ('Bacillus methylotrophicus','Fungos fitopatogênicos','doenca'),
  ('Bacillus methylotrophicus','Bacterioses','doenca'),
  ('Bacillus methylotrophicus','Proteção radicular','solo'),
  -- Bacillus pumilus
  ('Bacillus pumilus','Doenças fúngicas','doenca'),
  ('Bacillus pumilus','Sanidade vegetal','solo'),
  ('Bacillus pumilus','Vigor inicial','crescimento'),
  ('Bacillus pumilus','Proteção preventiva','doenca'),
  -- Bacillus subtilis
  ('Bacillus subtilis','Doenças de solo','doenca'),
  ('Bacillus subtilis','Fungos fitopatogênicos','doenca'),
  ('Bacillus subtilis','Crescimento radicular','crescimento'),
  ('Bacillus subtilis','Indução de resistência','doenca'),
  ('Bacillus subtilis','Sanidade de rizosfera','solo'),
  -- Bt aizawai
  ('Bacillus thuringiensis aizawai','Lagartas','praga'),
  ('Bacillus thuringiensis aizawai','Lepidópteros','praga'),
  ('Bacillus thuringiensis aizawai','Desfolhadores','praga'),
  ('Bacillus thuringiensis aizawai','Manejo integrado de pragas','praga'),
  -- Bt kurstaki
  ('Bacillus thuringiensis kurstaki','Lagartas','praga'),
  ('Bacillus thuringiensis kurstaki','Lepidópteros','praga'),
  ('Bacillus thuringiensis kurstaki','Spodoptera','praga'),
  ('Bacillus thuringiensis kurstaki','Desfolhadores','praga'),
  -- Bacillus velezensis
  ('Bacillus velezensis','Doenças de solo','doenca'),
  ('Bacillus velezensis','Fungos fitopatogênicos','doenca'),
  ('Bacillus velezensis','Bacterioses','doenca'),
  ('Bacillus velezensis','Proteção radicular','solo'),
  ('Bacillus velezensis','Crescimento vegetal','crescimento'),
  -- Beauveria bassiana
  ('Beauveria bassiana','Insetos sugadores','praga'),
  ('Beauveria bassiana','Cochonilhas','praga'),
  ('Beauveria bassiana','Mosca-branca','praga'),
  ('Beauveria bassiana','Percevejos','praga'),
  ('Beauveria bassiana','Brocas','praga'),
  ('Beauveria bassiana','Pragas de solo','praga'),
  ('Beauveria bassiana','Manejo integrado de pragas','praga'),
  -- Chromobacterium subtsugae
  ('Chromobacterium subtsugae','Insetos-praga','praga'),
  ('Chromobacterium subtsugae','Pragas sugadoras','praga'),
  ('Chromobacterium subtsugae','Pragas mastigadoras','praga'),
  ('Chromobacterium subtsugae','Nematoides','nematoide'),
  ('Chromobacterium subtsugae','Pressão de pragas no manejo integrado','praga'),
  -- Cordyceps javanica
  ('Cordyceps javanica','Mosca-branca','praga'),
  ('Cordyceps javanica','Cigarrinha-do-milho','praga'),
  ('Cordyceps javanica','Psilídeos','praga'),
  ('Cordyceps javanica','Pulgões','praga'),
  ('Cordyceps javanica','Ácaros','praga'),
  ('Cordyceps javanica','Pragas sugadoras','praga'),
  -- E.M.
  ('E.M. (Microorganismos Eficientes)','Decomposição de resíduos','solo'),
  ('E.M. (Microorganismos Eficientes)','Ciclagem de matéria orgânica','solo'),
  ('E.M. (Microorganismos Eficientes)','Ativação biológica do solo','solo'),
  ('E.M. (Microorganismos Eficientes)','Compostagem','solo'),
  ('E.M. (Microorganismos Eficientes)','Equilíbrio microbiológico','solo'),
  -- Isaria fumosorosea
  ('Isaria fumosorosea','Mosca-branca','praga'),
  ('Isaria fumosorosea','Pulgões','praga'),
  ('Isaria fumosorosea','Cigarrinhas','praga'),
  ('Isaria fumosorosea','Ácaros','praga'),
  ('Isaria fumosorosea','Pragas sugadoras','praga'),
  -- Metarhizium anisopliae
  ('Metarhizium anisopliae','Cigarrinha-das-raízes','praga'),
  ('Metarhizium anisopliae','Cigarrinha-do-milho','praga'),
  ('Metarhizium anisopliae','Pragas de solo','praga'),
  ('Metarhizium anisopliae','Insetos sugadores','praga'),
  ('Metarhizium anisopliae','Manejo integrado de pragas','praga'),
  -- Methylobacterium symbioticum
  ('Methylobacterium symbioticum','Nutrição nitrogenada','nutricao'),
  ('Methylobacterium symbioticum','Eficiência de uso de nitrogênio','nutricao'),
  ('Methylobacterium symbioticum','Vigor vegetativo','crescimento'),
  ('Methylobacterium symbioticum','Manejo complementar de N','nutricao'),
  -- Paecilomyces lilacinus
  ('Paecilomyces lilacinus','Nematoides','nematoide'),
  ('Paecilomyces lilacinus','Ovos de nematoides','nematoide'),
  ('Paecilomyces lilacinus','Proteção radicular','solo'),
  ('Paecilomyces lilacinus','Áreas com histórico de nematoides','nematoide'),
  -- Pochonia chlamydosporia
  ('Pochonia chlamydosporia','Nematoides das galhas','nematoide'),
  ('Pochonia chlamydosporia','Ovos de nematoides','nematoide'),
  ('Pochonia chlamydosporia','Fêmeas de nematoides','nematoide'),
  ('Pochonia chlamydosporia','Proteção radicular','solo'),
  ('Pochonia chlamydosporia','Manejo biológico de solo','solo'),
  -- Pseudomonas fluorescens
  ('Pseudomonas fluorescens','Crescimento radicular','crescimento'),
  ('Pseudomonas fluorescens','Solubilização de nutrientes','nutricao'),
  ('Pseudomonas fluorescens','Competição com patógenos','doenca'),
  ('Pseudomonas fluorescens','Sanidade de rizosfera','solo'),
  ('Pseudomonas fluorescens','Vigor inicial','crescimento'),
  -- Purpureocillium lilacinum
  ('Purpureocillium lilacinum','Nematoides','nematoide'),
  ('Purpureocillium lilacinum','Ovos de nematoides','nematoide'),
  ('Purpureocillium lilacinum','Meloidogyne','nematoide'),
  ('Purpureocillium lilacinum','Proteção radicular','solo'),
  ('Purpureocillium lilacinum','Manejo preventivo de solo','solo'),
  -- Saccharopolyspora spinosa
  ('Saccharopolyspora spinosa','Insetos-praga','praga'),
  ('Saccharopolyspora spinosa','Lagartas','praga'),
  ('Saccharopolyspora spinosa','Tripes','praga'),
  ('Saccharopolyspora spinosa','Pragas mastigadoras','praga'),
  ('Saccharopolyspora spinosa','Manejo integrado de pragas','praga'),
  -- Trichoderma asperellum
  ('Trichoderma asperellum','Doenças de solo','doenca'),
  ('Trichoderma asperellum','Fungos fitopatogênicos','doenca'),
  ('Trichoderma asperellum','Podridões radiculares','doenca'),
  ('Trichoderma asperellum','Crescimento radicular','crescimento'),
  ('Trichoderma asperellum','Indução de resistência','doenca'),
  -- Trichoderma harzianum
  ('Trichoderma harzianum','Doenças de solo','doenca'),
  ('Trichoderma harzianum','Fusarium','doenca'),
  ('Trichoderma harzianum','Rhizoctonia','doenca'),
  ('Trichoderma harzianum','Sclerotium','doenca'),
  ('Trichoderma harzianum','Podridões radiculares','doenca'),
  ('Trichoderma harzianum','Desenvolvimento radicular','crescimento');

  FOR r IN SELECT * FROM _fase7_alvos LOOP
    SELECT id INTO v_mid FROM public.microrganismos
     WHERE lower(trim(nome_cientifico)) = lower(trim(r.nome_cientifico)) LIMIT 1;
    IF v_mid IS NULL THEN
      SELECT id INTO v_mid FROM public.microrganismos
       WHERE lower(trim(nome)) = lower(trim(r.nome_cientifico)) LIMIT 1;
    END IF;
    IF v_mid IS NULL THEN CONTINUE; END IF;

    -- dedupe por (microrganismo_id, lower(alvo_nome))
    IF EXISTS (
      SELECT 1 FROM public.microorganism_targets
       WHERE microrganismo_id = v_mid
         AND lower(trim(alvo_nome)) = lower(trim(r.alvo_nome))
    ) THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(MAX(prioridade),0)+1 INTO v_prio
      FROM public.microorganism_targets WHERE microrganismo_id = v_mid;

    INSERT INTO public.microorganism_targets (microrganismo_id, alvo_nome, alvo_tipo, prioridade, ativo)
    VALUES (v_mid, r.alvo_nome, r.alvo_tipo, v_prio, true);
  END LOOP;
END
$fase7t$;

-- ---------------------------------------------------------------------
-- 3) FONTES TÉCNICAS (catalog_technical_sources) — por grupo, sem duplicidade
-- ---------------------------------------------------------------------
DO $fase7s$
DECLARE
  v_mid uuid;
  r record;
BEGIN
  CREATE TEMP TABLE _fase7_fontes (
    grupo text, nome_cientifico text, fonte_titulo text, fonte_url text,
    fonte_tipo text, idioma text, pais text, resumo text, nivel text
  ) ON COMMIT DROP;

  -- Mapeamento (microrganismo, grupo)
  CREATE TEMP TABLE _fase7_grupo_micros (grupo text, nome_cientifico text) ON COMMIT DROP;
  INSERT INTO _fase7_grupo_micros VALUES
  ('Bacillus spp.','Bacillus amyloliquefaciens'),
  ('Bacillus spp.','Bacillus aryabhattai'),
  ('Bacillus spp.','Bacillus licheniformis'),
  ('Bacillus spp.','Bacillus megaterium'),
  ('Bacillus spp.','Bacillus methylotrophicus'),
  ('Bacillus spp.','Bacillus pumilus'),
  ('Bacillus spp.','Bacillus subtilis'),
  ('Bacillus spp.','Bacillus velezensis'),
  ('Bacillus thuringiensis','Bacillus thuringiensis aizawai'),
  ('Bacillus thuringiensis','Bacillus thuringiensis kurstaki'),
  ('Trichoderma spp.','Trichoderma asperellum'),
  ('Trichoderma spp.','Trichoderma harzianum'),
  ('Beauveria e Metarhizium','Beauveria bassiana'),
  ('Beauveria e Metarhizium','Metarhizium anisopliae'),
  ('Beauveria e Metarhizium','Cordyceps javanica'),
  ('Beauveria e Metarhizium','Isaria fumosorosea'),
  ('Fungos nematófagos','Pochonia chlamydosporia'),
  ('Fungos nematófagos','Purpureocillium lilacinum'),
  ('Fungos nematófagos','Paecilomyces lilacinus'),
  ('Methylobacterium symbioticum','Methylobacterium symbioticum'),
  ('Pseudomonas fluorescens','Pseudomonas fluorescens'),
  ('Chromobacterium subtsugae','Chromobacterium subtsugae'),
  ('Saccharopolyspora spinosa','Saccharopolyspora spinosa'),
  ('E.M.','E.M. (Microorganismos Eficientes)');

  INSERT INTO _fase7_fontes VALUES
  ('Bacillus spp.', NULL, 'Embrapa — Bactérias do gênero Bacillus em programas biológicos',
    'https://www.embrapa.br/busca-de-publicacoes/-/publicacao/lista/titulo/Bacillus',
    'embrapa','pt','BR',
    'Documentos técnicos da Embrapa sobre uso de Bacillus em manejo biológico de solo e parte aérea.','medio'),
  ('Bacillus spp.', NULL, 'Frontiers in Microbiology — Plant Growth-Promoting Bacillus',
    'https://www.frontiersin.org/journals/microbiology/articles?query=Bacillus+plant+growth',
    'revisao_cientifica','en','INT',
    'Revisões científicas sobre mecanismos de promoção de crescimento e biocontrole por Bacillus.','medio'),
  ('Bacillus thuringiensis', NULL, 'Embrapa — Bacillus thuringiensis no controle biológico',
    'https://www.embrapa.br/busca-de-publicacoes/-/publicacao/lista/titulo/Bacillus%20thuringiensis',
    'embrapa','pt','BR',
    'Publicações Embrapa sobre o uso de Bt no controle de lagartas e MIP.','alto'),
  ('Bacillus thuringiensis', NULL, 'Annual Review of Entomology — Bt toxins overview',
    'https://www.annualreviews.org/journal/ento',
    'revisao_cientifica','en','INT',
    'Revisões sobre proteínas Cry/Vip e mecanismos de ação em lepidópteros.','alto'),
  ('Trichoderma spp.', NULL, 'Embrapa — Trichoderma em manejo biológico de solo',
    'https://www.embrapa.br/busca-de-publicacoes/-/publicacao/lista/titulo/Trichoderma',
    'embrapa','pt','BR',
    'Materiais técnicos sobre uso de Trichoderma em doenças de solo e promoção de crescimento.','medio'),
  ('Trichoderma spp.', NULL, 'Biological Control — Trichoderma mechanisms',
    'https://www.sciencedirect.com/journal/biological-control',
    'revisao_cientifica','en','INT',
    'Revisões sobre micoparasitismo, competição e indução de resistência por Trichoderma.','medio'),
  ('Beauveria e Metarhizium', NULL, 'Embrapa — Fungos entomopatogênicos no Brasil',
    'https://www.embrapa.br/busca-de-publicacoes/-/publicacao/lista/titulo/Beauveria',
    'embrapa','pt','BR',
    'Publicações sobre Beauveria, Metarhizium, Cordyceps e Isaria no manejo de pragas.','medio'),
  ('Beauveria e Metarhizium', NULL, 'Journal of Invertebrate Pathology — Entomopathogenic fungi',
    'https://www.sciencedirect.com/journal/journal-of-invertebrate-pathology',
    'revisao_cientifica','en','INT',
    'Revisões científicas sobre fungos entomopatogênicos e seu uso em MIP.','medio'),
  ('Fungos nematófagos', NULL, 'Embrapa — Manejo biológico de nematoides',
    'https://www.embrapa.br/busca-de-publicacoes/-/publicacao/lista/titulo/nematoides%20biol%C3%B3gico',
    'embrapa','pt','BR',
    'Publicações Embrapa sobre Pochonia, Purpureocillium e Paecilomyces no manejo de nematoides.','medio'),
  ('Fungos nematófagos', NULL, 'Biological Control — Nematophagous fungi',
    'https://www.sciencedirect.com/topics/agricultural-and-biological-sciences/nematophagous-fungi',
    'revisao_cientifica','en','INT',
    'Revisões sobre fungos nematófagos e parasitismo de ovos e fêmeas.','medio'),
  ('Methylobacterium symbioticum', NULL, 'Boletim técnico — Methylobacterium symbioticum e fixação complementar de N',
    'https://www.frontiersin.org/journals/plant-science/articles?query=Methylobacterium+symbioticum',
    'revisao_cientifica','en','INT',
    'Materiais técnicos e revisões sobre fixação biológica complementar de N por Methylobacterium symbioticum.','medio'),
  ('Methylobacterium symbioticum', NULL, 'AR Bio — Nota técnica interna: M. symbioticum não substitui adubação nitrogenada',
    'https://ar-bio.com.br/notas-tecnicas/methylobacterium-symbioticum',
    'boletim_tecnico','pt','BR',
    'Nota técnica AR Bio reforçando que o produto não substitui totalmente a adubação nitrogenada.','alto'),
  ('Pseudomonas fluorescens', NULL, 'Embrapa — Pseudomonas em rizosfera',
    'https://www.embrapa.br/busca-de-publicacoes/-/publicacao/lista/titulo/Pseudomonas',
    'embrapa','pt','BR',
    'Publicações sobre Pseudomonas fluorescens em promoção de crescimento e biocontrole.','medio'),
  ('Pseudomonas fluorescens', NULL, 'Frontiers in Plant Science — Pseudomonas PGPR',
    'https://www.frontiersin.org/journals/plant-science/articles?query=Pseudomonas+fluorescens',
    'revisao_cientifica','en','INT',
    'Revisões científicas sobre Pseudomonas fluorescens como PGPR.','medio'),
  ('Chromobacterium subtsugae', NULL, 'Boletim técnico — Chromobacterium subtsugae no manejo de pragas',
    'https://www.sciencedirect.com/topics/agricultural-and-biological-sciences/chromobacterium',
    'boletim_tecnico','en','INT',
    'Boletins técnicos sobre Chromobacterium subtsugae em MIP.','medio'),
  ('Saccharopolyspora spinosa', NULL, 'Revisão científica — Espinosinas de Saccharopolyspora spinosa',
    'https://pubs.acs.org/doi/10.1021/np50106a001',
    'revisao_cientifica','en','INT',
    'Revisões sobre origem e ação das espinosinas em controle de insetos.','alto'),
  ('E.M.', NULL, 'Boletim técnico — Microrganismos Eficientes (EM) em manejo agrícola',
    'https://www.embrapa.br/busca-de-publicacoes/-/publicacao/lista/titulo/microrganismos%20eficientes',
    'boletim_tecnico','pt','BR',
    'Boletins e publicações sobre uso de consórcios EM em compostagem e biologização.','medio');

  -- Para cada combinação (grupo x microrganismo do grupo), inserir todas as fontes do grupo
  FOR r IN
    SELECT g.nome_cientifico, f.fonte_titulo, f.fonte_url, f.fonte_tipo,
           f.idioma, f.pais, f.resumo, f.nivel
      FROM _fase7_grupo_micros g
      JOIN _fase7_fontes f ON f.grupo = g.grupo
  LOOP
    SELECT id INTO v_mid FROM public.microrganismos
     WHERE lower(trim(nome_cientifico)) = lower(trim(r.nome_cientifico)) LIMIT 1;
    IF v_mid IS NULL THEN
      SELECT id INTO v_mid FROM public.microrganismos
       WHERE lower(trim(nome)) = lower(trim(r.nome_cientifico)) LIMIT 1;
    END IF;
    IF v_mid IS NULL THEN
      RAISE NOTICE 'FASE 7 (fontes) — microrganismo não localizado: %', r.nome_cientifico;
      CONTINUE;
    END IF;

    INSERT INTO public.catalog_technical_sources (
      entidade_tipo, entidade_id, fonte_titulo, fonte_url, fonte_tipo,
      idioma_original, pais_origem, resumo_evidencia, nivel_confianca, data_consulta
    ) VALUES (
      'microrganismo', v_mid, r.fonte_titulo, r.fonte_url, r.fonte_tipo,
      r.idioma, r.pais, r.resumo, r.nivel, current_date
    )
    ON CONFLICT (source_key) DO NOTHING;
  END LOOP;
END
$fase7s$;

-- ---------------------------------------------------------------------
-- 4) Validação final
-- ---------------------------------------------------------------------
DO $val$
DECLARE
  v_fichas int; v_em_revisao int; v_aprovadas int;
  v_micros_ativos int; v_micros_com_ficha int;
  v_alvos int; v_fontes int;
BEGIN
  SELECT count(*) INTO v_fichas FROM public.microorganism_technical_profiles;
  SELECT count(*) INTO v_em_revisao FROM public.microorganism_technical_profiles WHERE status_validacao='em_revisao';
  SELECT count(*) INTO v_aprovadas FROM public.microorganism_technical_profiles WHERE status_validacao='aprovado';
  SELECT count(*) INTO v_micros_ativos FROM public.microrganismos WHERE ativo;
  SELECT count(DISTINCT m.id) INTO v_micros_com_ficha
    FROM public.microrganismos m
    JOIN public.microorganism_technical_profiles p ON p.microrganismo_id=m.id
    WHERE m.ativo;
  SELECT count(*) INTO v_alvos FROM public.microorganism_targets WHERE ativo;
  SELECT count(*) INTO v_fontes FROM public.catalog_technical_sources WHERE entidade_tipo='microrganismo';

  RAISE NOTICE '==== FASE 7 — RESUMO ====';
  RAISE NOTICE 'Fichas totais: %', v_fichas;
  RAISE NOTICE 'Fichas em revisão: %', v_em_revisao;
  RAISE NOTICE 'Fichas aprovadas (preservadas): %', v_aprovadas;
  RAISE NOTICE 'Microrganismos ativos: %', v_micros_ativos;
  RAISE NOTICE 'Microrganismos ativos com ficha: %', v_micros_com_ficha;
  RAISE NOTICE 'Alvos ativos: %', v_alvos;
  RAISE NOTICE 'Fontes técnicas (microrganismo): %', v_fontes;
END
$val$;
