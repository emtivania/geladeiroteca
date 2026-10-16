-- ============================================================================
-- BibVânia Online — supabase_setup.sql
-- Configuração pública do banco de dados Supabase
-- ============================================================================
--
-- PROPÓSITO
--   Cria toda a estrutura de banco necessária para o BibVânia Online:
--   tabelas, tipos, funções, políticas RLS e triggers.
--   Este arquivo é SEGURO para commitar no GitHub (não contém segredos).
--
-- PRÉ-REQUISITO
--   Execute este arquivo ANTES de setup_private.sql.
--
-- COMO EXECUTAR
--   1. Acesse o Dashboard do Supabase → SQL Editor → New query
--   2. Cole o conteúdo e clique em Run
--
-- TABELAS CRIADAS
--   livros          — Acervo bibliográfico (título, autor, ISBN, categoria,
--                     quantidade_total, quantidade_disponivel, imagem_url,
--                     pdf_url, verso_url, alt_text, data_cadastro,
--                     data_edicao)
--   emprestimos     — Registro de empréstimos e devoluções (livro_id,
--                     pessoa_id, nome_aluno, sexo, ano_aluno, turma_aluno,
--                     status, data_emprestimo, data_prevista_devolucao,
--                     data_devolucao, dias_emprestimo, sem_data_definida)
--   pessoas         — Cadastro de alunos, visitantes e funcionários (nome, sexo,
--                     tipo, ano_aluno, turma_aluno, pcd, data_cadastro)
--   reservas        — Solicitações de reserva, status e snapshot da pessoa
--   config_privada  — Chaves de API (imgbb_api_key, mistral_api_key)
--                     com RLS: somente usuários autenticados leem
--   (Perfil do admin: nome e foto ficam no user_metadata do Supabase Auth,
--    não há tabela admins — veja a seção 11.)
--
-- SEGURANÇA (RLS)
--   • Quem está logado (role authenticated) já é administrador: não há tabela
--     admins nem verificação adicional.
--   • livros: leitura pública; escrita somente autenticado
--   • pessoas, emprestimos, reservas, livros_excluidos: leitura e escrita
--     somente autenticado
--   • funções públicas de reserva expõem somente perfil mínimo e operações validadas
--   • config_privada: somente autenticados leem
--   • IMPORTANTE: o cadastro público de usuários DEVE ficar desativado no
--     Supabase (Authentication → Sign In / Providers → "Allow new users to
--     sign up" desligado); caso contrário, qualquer pessoa poderia criar uma
--     conta e se tornar administradora.
--
-- TRIGGERS / FUNÇÕES
--   • recalcular_disponivel(): atualiza quantidade_disponivel após mudanças
--     em emprestimos e reservas (total − empréstimos ativos − reservas pendentes)
--
-- ============================================================================


-- 0. EXTENSÕES NECESSÁRIAS
-- Mantém a extensão fora de public para reduzir a superfície exposta pela API.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
DO $$
DECLARE v_schema TEXT;
BEGIN
    SELECT n.nspname INTO v_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'unaccent';
    IF v_schema = 'public' THEN
        ALTER EXTENSION unaccent SET SCHEMA extensions;
    END IF;
END
$$;

-- Reservas são preservadas e configuradas na seção 15; não remover dados
-- existentes ao reaplicar este script.

-- Remoção compatível com bancos existentes: o campo palavra-chave não faz mais
-- parte da aplicação nem do modelo de dados.
ALTER TABLE IF EXISTS livros DROP COLUMN IF EXISTS palavras_chave;

-- Adição compatível com bancos existentes: campos Volume e Edição do livro
-- (CREATE TABLE IF NOT EXISTS abaixo não altera tabelas já criadas).
ALTER TABLE IF EXISTS livros ADD COLUMN IF NOT EXISTS volume INTEGER;
ALTER TABLE IF EXISTS livros ADD COLUMN IF NOT EXISTS edicao INTEGER;

-- 1. TABELA DE LIVROS
CREATE TABLE IF NOT EXISTS livros (
    id BIGINT PRIMARY KEY,
    isbn TEXT,
    imagem_url TEXT,
    pdf_url TEXT,
    verso_url TEXT,
    titulo TEXT NOT NULL,
    autor TEXT,
    categoria TEXT,
    volume INTEGER,
    edicao INTEGER,
    alt_text TEXT,
    quantidade_total INTEGER NOT NULL DEFAULT 1,
    quantidade_disponivel INTEGER NOT NULL DEFAULT 1,
    data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_edicao TIMESTAMP WITH TIME ZONE
);

-- 2. TABELA DE EMPRÉSTIMOS
-- Nota: pessoa_id é adicionado via ALTER TABLE na seção 14,
-- após a criação da tabela pessoas.
CREATE TABLE IF NOT EXISTS emprestimos (
    id BIGSERIAL PRIMARY KEY,
    livro_id BIGINT REFERENCES livros(id) ON DELETE CASCADE,
    nome_aluno TEXT NOT NULL,
    sexo CHAR(1),
    ano_aluno INTEGER,
    turma_aluno TEXT,
    data_emprestimo TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_prevista_devolucao TIMESTAMP WITH TIME ZONE,
    data_devolucao TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'emprestado' CHECK (status IN ('emprestado', 'devolvido')),
    dias_emprestimo INTEGER,
    sem_data_definida BOOLEAN DEFAULT FALSE
);

-- 3. TABELA DE HISTÓRICO DE EXCLUSÃO
CREATE TABLE IF NOT EXISTS livros_excluidos (
    id BIGSERIAL PRIMARY KEY,
    livro_id BIGINT,
    titulo TEXT,
    autor TEXT,
    isbn TEXT,
    data_exclusao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. SEGURANÇA (RLS)
ALTER TABLE livros ENABLE ROW LEVEL SECURITY;
ALTER TABLE emprestimos ENABLE ROW LEVEL SECURITY;
ALTER TABLE livros_excluidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura autenticada de livros_excluidos" ON livros_excluidos;
DROP POLICY IF EXISTS "Escrita autenticada de livros_excluidos" ON livros_excluidos;
DROP POLICY IF EXISTS "Inserção autenticada de livros_excluidos" ON livros_excluidos;
DROP POLICY IF EXISTS "Atualização autenticada de livros_excluidos" ON livros_excluidos;
DROP POLICY IF EXISTS "Exclusão autenticada de livros_excluidos" ON livros_excluidos;
CREATE POLICY "Leitura autenticada de livros_excluidos" ON livros_excluidos
    FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Inserção autenticada de livros_excluidos" ON livros_excluidos
    FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Atualização autenticada de livros_excluidos" ON livros_excluidos
    FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL)
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Exclusão autenticada de livros_excluidos" ON livros_excluidos
    FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Leitura pública de livros" ON livros;
DROP POLICY IF EXISTS "Escrita autenticada de livros" ON livros;
DROP POLICY IF EXISTS "Inserção autenticada de livros" ON livros;
DROP POLICY IF EXISTS "Atualização autenticada de livros" ON livros;
DROP POLICY IF EXISTS "Exclusão autenticada de livros" ON livros;
CREATE POLICY "Leitura pública de livros" ON livros FOR SELECT USING (true);
CREATE POLICY "Inserção autenticada de livros" ON livros
    FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Atualização autenticada de livros" ON livros
    FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL)
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Exclusão autenticada de livros" ON livros
    FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL);

-- SEGURANÇA (set/2026): emprestimos deixou de ter leitura pública — a tabela
-- guarda nome_aluno/sexo/ano_aluno/turma_aluno (dados de alunos) e, com a
-- chave pública (publishable) exposta no bibcore.js, "leitura pública" significava que
-- qualquer pessoa podia consultar a API do Supabase diretamente e baixar
-- a lista completa de quem está com qual livro. A política "Escrita
-- autenticada" abaixo é FOR ALL, então já cobre leitura para o admin
-- logado — não recriamos leitura pública na tabela. O catálogo público não
-- consulta dados de empréstimos.
DROP POLICY IF EXISTS "Leitura pública de emprestimos" ON emprestimos;
DROP POLICY IF EXISTS "Escrita autenticada de emprestimos" ON emprestimos;
DROP POLICY IF EXISTS "Leitura autenticada de emprestimos" ON emprestimos;
DROP POLICY IF EXISTS "Inserção autenticada de emprestimos" ON emprestimos;
DROP POLICY IF EXISTS "Atualização autenticada de emprestimos" ON emprestimos;
DROP POLICY IF EXISTS "Exclusão autenticada de emprestimos" ON emprestimos;
CREATE POLICY "Leitura autenticada de emprestimos" ON emprestimos
    FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Inserção autenticada de emprestimos" ON emprestimos
    FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Atualização autenticada de emprestimos" ON emprestimos
    FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL)
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Exclusão autenticada de emprestimos" ON emprestimos
    FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL);

-- 5. TRIGGER DE DISPONIBILIDADE
-- Um exemplar é considerado ocupado por empréstimo ativo OU reserva pendente.
-- A tabela reservas é criada adiante; a checagem dinâmica permite que o restante
-- deste script migre empréstimos antes da primeira criação dessa tabela.
CREATE OR REPLACE FUNCTION public.recalcular_disponivel_livro(p_livro_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total INTEGER;
    v_emprestados BIGINT := 0;
    v_reservas BIGINT := 0;
BEGIN
    SELECT quantidade_total INTO v_total
    FROM public.livros WHERE id = p_livro_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT COUNT(*) INTO v_emprestados
    FROM public.emprestimos
    WHERE livro_id = p_livro_id AND status = 'emprestado';

    IF pg_catalog.to_regclass('public.reservas') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM public.reservas WHERE livro_id = $1 AND status = $2'
            INTO v_reservas USING p_livro_id, 'pendente';
    END IF;

    UPDATE public.livros
    SET quantidade_disponivel = GREATEST(
        0::BIGINT,
        COALESCE(v_total, 0)::BIGINT - COALESCE(v_emprestados, 0) - COALESCE(v_reservas, 0)
    )::INTEGER
    WHERE id = p_livro_id;
END;
$$;
REVOKE ALL ON FUNCTION public.recalcular_disponivel_livro(BIGINT) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE f REGPROCEDURE;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('recalcular_disponivel', 'rls_auto_enable')
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.recalcular_disponivel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recalcular_disponivel_livro(OLD.livro_id);
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.livro_id IS DISTINCT FROM NEW.livro_id THEN
        PERFORM public.recalcular_disponivel_livro(OLD.livro_id);
    END IF;
    PERFORM public.recalcular_disponivel_livro(NEW.livro_id);
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.recalcular_disponivel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_atualizar_disponivel ON emprestimos;
CREATE TRIGGER trigger_atualizar_disponivel
AFTER INSERT OR UPDATE OR DELETE ON emprestimos
FOR EACH ROW EXECUTE FUNCTION recalcular_disponivel();

-- 6. COLUNAS ADICIONAIS (migração para bancos instalados antes desta versão)
-- Todas estas colunas já estão no CREATE TABLE acima (seção 1).
-- Os ALTER TABLE abaixo são mantidos apenas para instalações existentes que
-- ainda não possuem essas colunas. Em bancos novos, IF NOT EXISTS os ignora.
ALTER TABLE livros ADD COLUMN IF NOT EXISTS imagem_url TEXT;
ALTER TABLE livros ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE livros ADD COLUMN IF NOT EXISTS verso_url TEXT;
ALTER TABLE livros ADD COLUMN IF NOT EXISTS alt_text TEXT;
ALTER TABLE livros ADD COLUMN IF NOT EXISTS data_edicao TIMESTAMP WITH TIME ZONE;

-- 7. TABELA DE PESSOAS (alunos, visitantes e funcionários)
CREATE TABLE IF NOT EXISTS pessoas (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    sexo CHAR(1) NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('aluno', 'funcionario', 'visitante')),
    ano_aluno INTEGER,
    turma_aluno TEXT,
    pcd BOOLEAN DEFAULT FALSE,
    data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE pessoas ENABLE ROW LEVEL SECURITY;
-- pcd já definido na criação da tabela acima; ADD COLUMN IF NOT EXISTS para bancos existentes:
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS pcd BOOLEAN DEFAULT FALSE;
-- SEGURANÇA (set/2026): pessoas nunca é lida pelo catálogo público (index.html)
-- — só pelo admin.html, já autenticado. "Leitura pública" aqui expunha nome,
-- sexo, ano/turma e status de PCD de todos os alunos/funcionários pra
-- qualquer um com a chave pública (publishable) no bibconfig.js, sem precisar de
-- login algum. A política "Escrita autenticada" abaixo é FOR ALL, então já
-- cobre a leitura do admin — não recriamos leitura pública na tabela.
DROP POLICY IF EXISTS "Leitura pública de pessoas" ON pessoas;
DROP POLICY IF EXISTS "Escrita autenticada de pessoas" ON pessoas;
DROP POLICY IF EXISTS "Leitura autenticada de pessoas" ON pessoas;
DROP POLICY IF EXISTS "Inserção autenticada de pessoas" ON pessoas;
DROP POLICY IF EXISTS "Atualização autenticada de pessoas" ON pessoas;
DROP POLICY IF EXISTS "Exclusão autenticada de pessoas" ON pessoas;
CREATE POLICY "Leitura autenticada de pessoas" ON pessoas
    FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Inserção autenticada de pessoas" ON pessoas
    FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Atualização autenticada de pessoas" ON pessoas
    FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL)
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Exclusão autenticada de pessoas" ON pessoas
    FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL);

-- 8. REALTIME
-- Habilita atualizações em tempo real para livros, emprestimos e pessoas.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'livros'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE livros;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'emprestimos'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE emprestimos;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'pessoas'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE pessoas;
    END IF;
END $$;

-- 9. VERIFICAR REALTIME ATIVO
-- Execute para confirmar que as 3 tabelas estão com Realtime habilitado:
-- SELECT schemaname, tablename
-- FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime'
-- ORDER BY tablename;

-- ============================================================================
-- 10. CONFIGURAÇÕES PRIVADAS (chaves de API)
-- Acessível apenas por usuários autenticados (admin).
-- ATENÇÃO: Execute setup_private.sql separadamente para inserir
-- as chaves reais. Esse arquivo NÃO vai para o GitHub.
-- ============================================================================

CREATE TABLE IF NOT EXISTS config_privada (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);

ALTER TABLE config_privada ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Somente autenticados leem config_privada" ON config_privada;
CREATE POLICY "Somente autenticados leem config_privada"
    ON config_privada FOR SELECT TO authenticated
    USING ((select auth.uid()) IS NOT NULL);

-- Ninguém (nem autenticado) pode inserir/alterar/deletar via API
-- Só você pelo Dashboard do Supabase

-- ============================================================================
-- 11. PERFIL DO ADMIN (NOME E FOTO) — SEM TABELA ADMINS
-- Não existe tabela de admins: quem está logado já é administrador.
-- Nome e foto de perfil ficam no user_metadata do Supabase Auth:
--   • foto_url — gravada pelo próprio painel (supabase.auth.updateUser)
--   • nome     — opcional; sem nome, o painel mostra "OLÁ, ADMIN!"
-- Para definir o nome exibido no painel (por e-mail, sem UUID), rode no SQL Editor:
--   UPDATE auth.users
--   SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
--       || jsonb_build_object('nome', 'Nome exibido no painel')
--   WHERE email = 'EMAIL_DO_USUARIO';
-- Para conferir:
--   SELECT email, raw_user_meta_data->>'nome' AS nome
--   FROM auth.users WHERE email = 'EMAIL_DO_USUARIO';
-- ============================================================================

-- ============================================================================
-- 12. PESSOA_ID EM EMPRÉSTIMOS

-- Vincula cada empréstimo diretamente à pessoa cadastrada via pessoa_id,
-- evitando colisão de homônimos.
-- ============================================================================

-- Adiciona pessoa_id em emprestimos (após pessoas já criada)
-- ADD COLUMN IF NOT EXISTS é seguro: não falha se a coluna já existir
ALTER TABLE emprestimos ADD COLUMN IF NOT EXISTS pessoa_id BIGINT REFERENCES pessoas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_emprestimos_pessoa_id ON emprestimos(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_livro_id ON emprestimos(livro_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_nome ON pessoas USING btree (nome);
CREATE INDEX IF NOT EXISTS idx_livros_titulo ON livros USING btree (titulo);

DO $$
BEGIN
    IF to_regclass('public.bibfiles_pdfs') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_bibfiles_pdfs_user_id
            ON public.bibfiles_pdfs USING btree (user_id);
    END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════
-- MIGRAÇÃO: Preencher pessoa_id nos empréstimos existentes
-- Seguro rodar múltiplas vezes — só afeta registros com pessoa_id NULL
-- ATENÇÃO: Se houver nomes duplicados em pessoas, o id mais antigo (menor)
--          será usado. Revise manualmente se necessário.
-- ═══════════════════════════════════════════════════════════════
UPDATE emprestimos e
SET pessoa_id = (
    SELECT p.id FROM pessoas p
    WHERE UPPER(p.nome) = UPPER(e.nome_aluno)
    ORDER BY p.id ASC
    LIMIT 1
)
WHERE e.pessoa_id IS NULL
  AND e.nome_aluno IS NOT NULL;

-- Verificar vínculos após migração:
-- SELECT e.nome_aluno, e.pessoa_id, p.nome
-- FROM emprestimos e
-- LEFT JOIN pessoas p ON p.id = e.pessoa_id
-- WHERE e.pessoa_id IS NULL
-- LIMIT 20;

-- Migração: permitir o perfil visitante em bancos já existentes.
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'pessoas'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%funcionario%';
  IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE pessoas DROP CONSTRAINT ' || quote_ident(c); END IF;
  BEGIN ALTER TABLE pessoas ADD CONSTRAINT pessoas_tipo_check CHECK (tipo IN ('aluno', 'funcionario', 'visitante')); EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
-- Migração: corrigir quantidade disponível de todos os livros existentes.
-- O valor passa a refletir exatamente os empréstimos atualmente ativos.
UPDATE livros l
SET quantidade_disponivel = GREATEST(
  0,
  COALESCE(l.quantidade_total, 0) - COALESCE((
    SELECT COUNT(*)
    FROM emprestimos e
    WHERE e.livro_id = l.id
      AND e.status = 'emprestado'
  ), 0)
);

-- Migração: corrigir pessoa_id de empréstimos de homônimos.
-- Funcionários usam PROF/FUNC; alunos usam ano/turma; visitantes usam VISITANTE.
-- Isso corrige registros antigos que foram vinculados ao primeiro cadastro com o mesmo nome.
WITH candidatos AS (
  SELECT
    e.id AS emprestimo_id,
    p.id AS pessoa_id,
    ROW_NUMBER() OVER (PARTITION BY e.id ORDER BY p.id) AS ordem
  FROM emprestimos e
  JOIN pessoas p
    ON UPPER(TRIM(p.nome)) = UPPER(TRIM(e.nome_aluno))
   AND (
        (UPPER(TRIM(e.turma_aluno)) = 'PROF/FUNC' AND p.tipo = 'funcionario')
        OR
        (UPPER(TRIM(e.turma_aluno)) = 'VISITANTE' AND p.tipo = 'visitante')
        OR
        (UPPER(TRIM(e.turma_aluno)) NOT IN ('PROF/FUNC', 'VISITANTE')
         AND p.tipo = 'aluno'
         AND COALESCE(p.ano_aluno, 0) = COALESCE(e.ano_aluno, 0)
         AND UPPER(TRIM(COALESCE(p.turma_aluno, ''))) = UPPER(TRIM(COALESCE(e.turma_aluno, ''))))
      )
)
UPDATE emprestimos e
SET pessoa_id = c.pessoa_id
FROM candidatos c
WHERE c.emprestimo_id = e.id
  AND c.ordem = 1
  AND e.pessoa_id IS DISTINCT FROM c.pessoa_id;

-- Remove a view pública antiga que usava SECURITY DEFINER e acionava
-- alerta crítico no Supabase Security Advisor. O catálogo atual não a utiliza.
DROP VIEW IF EXISTS public.emprestimos_status_publico;

-- Conferência opcional dos empréstimos ativos após a correção:
-- SELECT e.id, e.nome_aluno, e.pessoa_id, p.tipo, p.ano_aluno, p.turma_aluno,
--        e.ano_aluno AS ano_no_emprestimo, e.turma_aluno AS turma_no_emprestimo
-- FROM emprestimos e
-- LEFT JOIN pessoas p ON p.id = e.pessoa_id
-- WHERE e.status = 'emprestado'
-- ORDER BY e.nome_aluno, e.id;


-- 15. RESERVAS (catálogo público + fila operacional)
-- Cada reserva pendente ocupa um exemplar até ser cancelada ou convertida em empréstimo.
-- O catálogo anônimo não recebe SELECT direto nas tabelas pessoas, emprestimos ou reservas.
CREATE TABLE IF NOT EXISTS public.reservas (
    id BIGSERIAL PRIMARY KEY,
    livro_id BIGINT NOT NULL REFERENCES public.livros(id) ON DELETE CASCADE,
    pessoa_id BIGINT REFERENCES public.pessoas(id) ON DELETE SET NULL,
    nome_pessoa TEXT NOT NULL,
    sexo CHAR(1),
    ano_aluno INTEGER,
    turma_aluno TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('aluno', 'funcionario', 'visitante')),
    data_reserva TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'concluida', 'cancelada'))
);

ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reservas somente autenticados" ON public.reservas;
DROP POLICY IF EXISTS "Leitura autenticada de reservas" ON public.reservas;
DROP POLICY IF EXISTS "Cancelamento autenticado de reservas" ON public.reservas;
CREATE POLICY "Leitura autenticada de reservas" ON public.reservas
    FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Cancelamento autenticado de reservas" ON public.reservas
    FOR UPDATE TO authenticated
    USING ((select auth.uid()) IS NOT NULL AND status = 'pendente')
    WITH CHECK (status = 'cancelada');
REVOKE ALL ON TABLE public.reservas FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.reservas TO authenticated;
REVOKE ALL ON SEQUENCE public.reservas_id_seq FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_reservas_status_data
    ON public.reservas (status, data_reserva);
CREATE INDEX IF NOT EXISTS idx_reservas_livro_status
    ON public.reservas (livro_id, status);
CREATE INDEX IF NOT EXISTS idx_reservas_pessoa_status
    ON public.reservas (pessoa_id, status);
-- Alunos e visitantes compartilham o limite: uma reserva pendente por pessoa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reserva_pendente_aluno_visitante
    ON public.reservas (pessoa_id)
    WHERE status = 'pendente' AND tipo IN ('aluno', 'visitante') AND pessoa_id IS NOT NULL;
-- Funcionários não têm índice de unicidade: podem manter qualquer quantidade de reservas.

-- Mantém a disponibilidade em livros sincronizada com empréstimos e reservas.
DROP TRIGGER IF EXISTS trigger_atualizar_disponivel_reservas ON public.reservas;
CREATE TRIGGER trigger_atualizar_disponivel_reservas
AFTER INSERT OR UPDATE OR DELETE ON public.reservas
FOR EACH ROW EXECUTE FUNCTION public.recalcular_disponivel();

-- Bloqueia INSERT/reativação de uma reserva quando não há exemplar livre.
CREATE OR REPLACE FUNCTION public.validar_estoque_reserva()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_disponivel INTEGER;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status = 'pendente' AND NEW.status = 'concluida'
       AND pg_catalog.current_setting('bibvania.reserva_conversion', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Use a operação transacional para concluir uma reserva';
    END IF;
    IF NEW.status <> 'pendente' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'pendente' AND OLD.livro_id = NEW.livro_id THEN
        RETURN NEW;
    END IF;

    SELECT quantidade_disponivel INTO v_disponivel
    FROM public.livros WHERE id = NEW.livro_id FOR UPDATE;
    IF NOT FOUND OR COALESCE(v_disponivel, 0) <= 0 THEN
        RAISE EXCEPTION 'Não há exemplar disponível para esta reserva';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_estoque_reserva() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_validar_estoque_reserva ON public.reservas;
CREATE TRIGGER trigger_validar_estoque_reserva
BEFORE INSERT OR UPDATE ON public.reservas
FOR EACH ROW EXECUTE FUNCTION public.validar_estoque_reserva();

-- O checkout manual não pode consumir exemplar já alocado a uma reserva.
CREATE OR REPLACE FUNCTION public.validar_estoque_emprestimo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_disponivel INTEGER;
BEGIN
    IF NEW.status <> 'emprestado' THEN RETURN NEW; END IF;
    IF pg_catalog.current_setting('bibvania.reserva_conversion', true) = 'on' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'emprestado' AND OLD.livro_id = NEW.livro_id THEN
        RETURN NEW;
    END IF;

    SELECT quantidade_disponivel INTO v_disponivel
    FROM public.livros WHERE id = NEW.livro_id FOR UPDATE;
    IF NOT FOUND OR COALESCE(v_disponivel, 0) <= 0 THEN
        RAISE EXCEPTION 'Livro indisponível: todos os exemplares estão emprestados ou reservados';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_estoque_emprestimo() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_validar_estoque_emprestimo ON public.emprestimos;
CREATE TRIGGER trigger_validar_estoque_emprestimo
BEFORE INSERT OR UPDATE ON public.emprestimos
FOR EACH ROW EXECUTE FUNCTION public.validar_estoque_emprestimo();

-- Impede salvar quantidade total abaixo das cópias em uso e ignora tentativas
-- de sobrescrever quantidade_disponivel diretamente pelo cliente.
CREATE OR REPLACE FUNCTION public.sincronizar_disponibilidade_livro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_emprestados BIGINT;
    v_reservas BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_emprestados
    FROM public.emprestimos
    WHERE livro_id = NEW.id AND status = 'emprestado';
    SELECT COUNT(*) INTO v_reservas
    FROM public.reservas
    WHERE livro_id = NEW.id AND status = 'pendente';

    IF TG_OP = 'UPDATE'
       AND NEW.quantidade_total IS DISTINCT FROM OLD.quantidade_total
       AND NEW.quantidade_total < v_emprestados + v_reservas THEN
        RAISE EXCEPTION 'Quantidade total não pode ficar abaixo dos exemplares emprestados ou reservados (% em uso)', v_emprestados + v_reservas;
    END IF;
    NEW.quantidade_disponivel := GREATEST(
        0::BIGINT,
        NEW.quantidade_total::BIGINT - v_emprestados - v_reservas
    )::INTEGER;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sincronizar_disponibilidade_livro() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_sincronizar_disponibilidade_livro ON public.livros;
CREATE TRIGGER trigger_sincronizar_disponibilidade_livro
BEFORE INSERT OR UPDATE OF quantidade_total, quantidade_disponivel ON public.livros
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_disponibilidade_livro();

CREATE OR REPLACE FUNCTION public.proteger_livro_com_reservas_pendentes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.reservas
        WHERE livro_id = OLD.id AND status = 'pendente'
    ) THEN
        RAISE EXCEPTION 'Cancele as reservas pendentes antes de excluir este livro';
    END IF;
    RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_livro_com_reservas_pendentes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_proteger_livro_com_reservas_pendentes ON public.livros;
CREATE TRIGGER trigger_proteger_livro_com_reservas_pendentes
BEFORE DELETE ON public.livros
FOR EACH ROW EXECUTE FUNCTION public.proteger_livro_com_reservas_pendentes();

-- Reaplicar a migração também ajusta livros que já tenham reservas pendentes.
UPDATE public.livros AS l
SET quantidade_disponivel = GREATEST(
    0::BIGINT,
    COALESCE(l.quantidade_total, 0)::BIGINT
    - (SELECT COUNT(*) FROM public.emprestimos e WHERE e.livro_id = l.id AND e.status = 'emprestado')
    - (SELECT COUNT(*) FROM public.reservas r WHERE r.livro_id = l.id AND r.status = 'pendente')
)::INTEGER;

-- Busca limitada: aceita trecho do nome (mínimo 1 caractere), filtra perfil,
-- retorna no máximo 8 cadastros e nunca expõe PCD ou dados de circulação.
CREATE OR REPLACE FUNCTION public.bv_buscar_pessoas_reserva(p_termo TEXT, p_tipos TEXT[])
RETURNS TABLE (
    pessoa_id BIGINT,
    nome TEXT,
    sexo CHAR(1),
    tipo TEXT,
    ano_aluno INTEGER,
    turma_aluno TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p.id, p.nome, p.sexo, p.tipo, p.ano_aluno, p.turma_aluno
    FROM public.pessoas AS p
    WHERE length(trim(coalesce(p_termo, ''))) >= 1
      AND p.tipo = ANY(
          CASE WHEN COALESCE(cardinality(p_tipos), 0) = 0
               THEN ARRAY['aluno']::TEXT[]
               ELSE p_tipos
          END
      )
      AND strpos(
          regexp_replace(lower(trim(p.nome)), '[[:space:]]+', ' ', 'g'),
          regexp_replace(lower(trim(p_termo)), '[[:space:]]+', ' ', 'g')
      ) > 0
    ORDER BY CASE WHEN strpos(
        regexp_replace(lower(trim(p.nome)), '[[:space:]]+', ' ', 'g'),
        regexp_replace(lower(trim(p_termo)), '[[:space:]]+', ' ', 'g')
    ) = 1 THEN 0 ELSE 1 END, p.nome
    LIMIT 8;
$$;
REVOKE ALL ON FUNCTION public.bv_buscar_pessoas_reserva(TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bv_buscar_pessoas_reserva(TEXT, TEXT[]) TO anon, authenticated;

-- Compatibilidade temporária com páginas antigas que enviam somente o nome.
CREATE OR REPLACE FUNCTION public.bv_buscar_pessoas_reserva(p_termo TEXT)
RETURNS TABLE (
    pessoa_id BIGINT,
    nome TEXT,
    sexo CHAR(1),
    tipo TEXT,
    ano_aluno INTEGER,
    turma_aluno TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT * FROM public.bv_buscar_pessoas_reserva(
        p_termo, ARRAY['aluno', 'funcionario', 'visitante']::TEXT[]
    );
$$;
REVOKE ALL ON FUNCTION public.bv_buscar_pessoas_reserva(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bv_buscar_pessoas_reserva(TEXT) TO anon, authenticated;

-- Cria a reserva sem liberar INSERT direto ao papel anon. A mesma transação
-- valida disponibilidade, perfil e limites, cancelando a anterior apenas quando
-- aluno/visitante confirmam a troca. Reservas antigas ficam preservadas no histórico.
CREATE OR REPLACE FUNCTION public.bv_criar_reserva(
    p_livro_id BIGINT,
    p_pessoa_id BIGINT,
    p_trocar BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pessoa public.pessoas%ROWTYPE;
    v_livro public.livros%ROWTYPE;
    v_reserva_id BIGINT;
    v_tem_pendente BOOLEAN;
BEGIN
    SELECT * INTO v_pessoa
    FROM public.pessoas
    WHERE id = p_pessoa_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'pessoa_nao_encontrada');
    END IF;

    SELECT * INTO v_livro
    FROM public.livros
    WHERE id = p_livro_id
    FOR UPDATE;
    IF NOT FOUND OR coalesce(v_livro.quantidade_disponivel, 0) <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'indisponivel');
    END IF;

    IF v_pessoa.tipo NOT IN ('aluno', 'funcionario', 'visitante') THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'perfil_nao_permitido');
    END IF;

    IF v_pessoa.tipo <> 'funcionario' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.reservas r
            WHERE r.pessoa_id = v_pessoa.id AND r.status = 'pendente'
        ) INTO v_tem_pendente;
        IF v_tem_pendente AND NOT coalesce(p_trocar, false) THEN
            RETURN jsonb_build_object('ok', false, 'codigo', 'reserva_pendente_existente');
        END IF;
        IF v_tem_pendente AND coalesce(p_trocar, false) THEN
            UPDATE public.reservas
            SET status = 'cancelada'
            WHERE pessoa_id = v_pessoa.id AND status = 'pendente';
        END IF;
    END IF;

    INSERT INTO public.reservas (
        livro_id, pessoa_id, nome_pessoa, sexo, ano_aluno, turma_aluno, tipo, status
    ) VALUES (
        v_livro.id, v_pessoa.id, v_pessoa.nome, v_pessoa.sexo,
        v_pessoa.ano_aluno, v_pessoa.turma_aluno, v_pessoa.tipo, 'pendente'
    ) RETURNING id INTO v_reserva_id;

    RETURN jsonb_build_object('ok', true, 'reserva_id', v_reserva_id, 'tipo', v_pessoa.tipo);
END;
$$;
REVOKE ALL ON FUNCTION public.bv_criar_reserva(BIGINT, BIGINT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bv_criar_reserva(BIGINT, BIGINT, BOOLEAN) TO anon, authenticated;

-- Converte reserva em empréstimo de forma atômica. Se qualquer validação ou INSERT
-- falhar, o status pendente também sofre rollback. Alunos e visitantes só concluem
-- quando não têm empréstimo ativo; funcionários podem acumular empréstimos.
CREATE OR REPLACE FUNCTION public.bv_concluir_reserva(
    p_reserva_id BIGINT,
    p_data_emprestimo TIMESTAMPTZ,
    p_dias INTEGER,
    p_sem_data BOOLEAN DEFAULT FALSE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reserva public.reservas%ROWTYPE;
    v_livro public.livros%ROWTYPE;
    v_data_base TIMESTAMPTZ := coalesce(p_data_emprestimo, CURRENT_TIMESTAMP);
    v_data_prevista TIMESTAMPTZ;
    v_dias INTEGER := p_dias;
    v_emprestimo_id BIGINT;
    v_emprestimos_ativos BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Apenas usuários autenticados podem concluir reservas';
    END IF;
    IF coalesce(p_sem_data, false) = false AND (p_dias IS NULL OR p_dias < 1 OR p_dias > 31) THEN
        RAISE EXCEPTION 'Informe um prazo de 1 a 31 dias';
    END IF;

    SELECT * INTO v_reserva
    FROM public.reservas
    WHERE id = p_reserva_id AND status = 'pendente'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reserva não está pendente';
    END IF;

    SELECT * INTO v_livro
    FROM public.livros
    WHERE id = v_reserva.livro_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Livro da reserva não foi encontrado';
    END IF;
    SELECT COUNT(*) INTO v_emprestimos_ativos
    FROM public.emprestimos
    WHERE livro_id = v_reserva.livro_id AND status = 'emprestado';
    IF COALESCE(v_livro.quantidade_total, 0) <= COALESCE(v_emprestimos_ativos, 0) THEN
        RAISE EXCEPTION 'Não há exemplar físico livre para concluir esta reserva';
    END IF;

    IF v_reserva.tipo IN ('aluno', 'visitante') AND EXISTS (
        SELECT 1
        FROM public.emprestimos e
        WHERE e.status = 'emprestado'
          AND (
              (v_reserva.pessoa_id IS NOT NULL AND e.pessoa_id = v_reserva.pessoa_id)
              OR (
                  e.pessoa_id IS NULL
                  AND upper(trim(coalesce(e.nome_aluno, ''))) = upper(trim(v_reserva.nome_pessoa))
                  AND (
                      (v_reserva.tipo = 'visitante' AND upper(trim(coalesce(e.turma_aluno, ''))) = 'VISITANTE')
                      OR
                      (v_reserva.tipo = 'aluno'
                       AND upper(trim(coalesce(e.turma_aluno, ''))) NOT IN ('PROF/FUNC', 'VISITANTE')
                       AND coalesce(e.ano_aluno, 0) = coalesce(v_reserva.ano_aluno, 0)
                       AND upper(trim(coalesce(e.turma_aluno, ''))) = upper(trim(coalesce(v_reserva.turma_aluno, ''))))
                  )
              )
          )
    ) THEN
        IF v_reserva.tipo = 'visitante' THEN
            RAISE EXCEPTION 'Visitante possui empréstimo ativo; registre a devolução antes de concluir a reserva';
        ELSE
            RAISE EXCEPTION 'Aluno possui empréstimo ativo; registre a devolução antes de concluir a reserva';
        END IF;
    END IF;

    IF coalesce(p_sem_data, false) THEN
        v_data_prevista := NULL;
        v_dias := 0;
    ELSE
        v_data_prevista := (v_data_base::date + v_dias)::timestamptz;
    END IF;

    -- A reserva já ocupa a cópia; a transição para empréstimo transfere a alocação.
    -- O gatilho do empréstimo permite esse insert especial após validar acima que
    -- há exemplar não emprestado, mesmo se outras reservas antigas lotarem a fila.
    PERFORM pg_catalog.set_config('bibvania.reserva_conversion', 'on', true);
    UPDATE public.reservas SET status = 'concluida' WHERE id = v_reserva.id;
    INSERT INTO public.emprestimos (
        livro_id, pessoa_id, nome_aluno, sexo, ano_aluno, turma_aluno,
        data_emprestimo, data_prevista_devolucao, status, dias_emprestimo, sem_data_definida
    ) VALUES (
        v_reserva.livro_id, v_reserva.pessoa_id, v_reserva.nome_pessoa, v_reserva.sexo,
        v_reserva.ano_aluno, v_reserva.turma_aluno, v_data_base, v_data_prevista,
        'emprestado', v_dias, coalesce(p_sem_data, false)
    ) RETURNING id INTO v_emprestimo_id;
    PERFORM pg_catalog.set_config('bibvania.reserva_conversion', 'off', true);

    RETURN v_emprestimo_id;
END;
$$;
REVOKE ALL ON FUNCTION public.bv_concluir_reserva(BIGINT, TIMESTAMPTZ, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bv_concluir_reserva(BIGINT, TIMESTAMPTZ, INTEGER, BOOLEAN) TO authenticated;

-- Realtime somente é recebido pelos usuários autenticados sujeitos à policy acima.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reservas'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.reservas;
    END IF;
END $$;



-- ============================================================================
-- 17. RESTRIÇÃO FINAL: OPERAÇÕES ADMINISTRATIVAS SOMENTE PARA AUTENTICADOS
-- Quem está logado já é administrador: basta (select auth.uid()) IS NOT NULL;
-- não é necessária nenhuma linha em tabela admins. Por isso o cadastro público
-- de usuários DEVE permanecer desativado no Supabase (Authentication →
-- Sign In / Providers → "Allow new users to sign up" desligado).
-- ============================================================================

-- Livros continuam públicos para leitura; escrita fica restrita a usuários autenticados.
DROP POLICY IF EXISTS "Inserção autenticada de livros" ON public.livros;
DROP POLICY IF EXISTS "Atualização autenticada de livros" ON public.livros;
DROP POLICY IF EXISTS "Exclusão autenticada de livros" ON public.livros;
CREATE POLICY "Inserção autenticada de livros" ON public.livros
    FOR INSERT TO authenticated
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Atualização autenticada de livros" ON public.livros
    FOR UPDATE TO authenticated
    USING ((select auth.uid()) IS NOT NULL)
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Exclusão autenticada de livros" ON public.livros
    FOR DELETE TO authenticated
    USING ((select auth.uid()) IS NOT NULL);

-- Dados de circulação só ficam disponíveis a usuários autenticados.
DROP POLICY IF EXISTS "Leitura autenticada de emprestimos" ON public.emprestimos;
DROP POLICY IF EXISTS "Inserção autenticada de emprestimos" ON public.emprestimos;
DROP POLICY IF EXISTS "Atualização autenticada de emprestimos" ON public.emprestimos;
DROP POLICY IF EXISTS "Exclusão autenticada de emprestimos" ON public.emprestimos;
CREATE POLICY "Leitura autenticada de emprestimos" ON public.emprestimos
    FOR SELECT TO authenticated
    USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Inserção autenticada de emprestimos" ON public.emprestimos
    FOR INSERT TO authenticated
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Atualização autenticada de emprestimos" ON public.emprestimos
    FOR UPDATE TO authenticated
    USING ((select auth.uid()) IS NOT NULL)
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Exclusão autenticada de emprestimos" ON public.emprestimos
    FOR DELETE TO authenticated
    USING ((select auth.uid()) IS NOT NULL);

-- pessoas: qualquer usuário autenticado (logado) pode listar e gerenciar;
-- O papel anon continua sem acesso direto.
DROP POLICY IF EXISTS "Leitura pública de pessoas" ON public.pessoas;
DROP POLICY IF EXISTS "Escrita autenticada de pessoas" ON public.pessoas;
DROP POLICY IF EXISTS "Leitura autenticada de pessoas" ON public.pessoas;
DROP POLICY IF EXISTS "Inserção autenticada de pessoas" ON public.pessoas;
DROP POLICY IF EXISTS "Atualização autenticada de pessoas" ON public.pessoas;
DROP POLICY IF EXISTS "Exclusão autenticada de pessoas" ON public.pessoas;
CREATE POLICY "Leitura autenticada de pessoas" ON public.pessoas
    FOR SELECT TO authenticated
    USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Inserção autenticada de pessoas" ON public.pessoas
    FOR INSERT TO authenticated
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Atualização autenticada de pessoas" ON public.pessoas
    FOR UPDATE TO authenticated
    USING ((select auth.uid()) IS NOT NULL)
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Exclusão autenticada de pessoas" ON public.pessoas
    FOR DELETE TO authenticated
    USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Leitura autenticada de livros_excluidos" ON public.livros_excluidos;
DROP POLICY IF EXISTS "Inserção autenticada de livros_excluidos" ON public.livros_excluidos;
DROP POLICY IF EXISTS "Atualização autenticada de livros_excluidos" ON public.livros_excluidos;
DROP POLICY IF EXISTS "Exclusão autenticada de livros_excluidos" ON public.livros_excluidos;
CREATE POLICY "Leitura autenticada de livros_excluidos" ON public.livros_excluidos
    FOR SELECT TO authenticated
    USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Inserção autenticada de livros_excluidos" ON public.livros_excluidos
    FOR INSERT TO authenticated
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Atualização autenticada de livros_excluidos" ON public.livros_excluidos
    FOR UPDATE TO authenticated
    USING ((select auth.uid()) IS NOT NULL)
    WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Exclusão autenticada de livros_excluidos" ON public.livros_excluidos
    FOR DELETE TO authenticated
    USING ((select auth.uid()) IS NOT NULL);

-- Reservas diretas também ficam limitadas a usuários autenticados; a criação pública continua
-- ocorrendo somente pela RPC controlada bv_criar_reserva.
DROP POLICY IF EXISTS "Leitura autenticada de reservas" ON public.reservas;
DROP POLICY IF EXISTS "Cancelamento autenticado de reservas" ON public.reservas;
CREATE POLICY "Leitura autenticada de reservas" ON public.reservas
    FOR SELECT TO authenticated
    USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "Cancelamento autenticado de reservas" ON public.reservas
    FOR UPDATE TO authenticated
    USING ((select auth.uid()) IS NOT NULL AND status = 'pendente')
    WITH CHECK (status = 'cancelada');

-- Chaves privadas só podem ser lidas por usuários autenticados (logados).
DROP POLICY IF EXISTS "Somente admins leem config_privada" ON public.config_privada;
DROP POLICY IF EXISTS "Somente autenticados leem config_privada" ON public.config_privada;
CREATE POLICY "Somente autenticados leem config_privada"
    ON public.config_privada FOR SELECT TO authenticated
    USING ((select auth.uid()) IS NOT NULL);
REVOKE ALL ON TABLE public.config_privada FROM anon;
GRANT SELECT ON TABLE public.config_privada TO authenticated;

NOTIFY pgrst, 'reload schema';
