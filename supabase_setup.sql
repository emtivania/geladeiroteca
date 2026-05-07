-- ============================================================================
-- BibVania — supabase_setup.sql
-- Configuração pública do banco de dados Supabase
-- ============================================================================
--
-- PROPÓSITO
--   Cria toda a estrutura de banco necessária para o BibVania:
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
--                     pdf_url, palavras_chave, alt_text, data_cadastro,
--                     data_edicao)
--   emprestimos     — Registro de empréstimos e devoluções (livro_id,
--                     nome_aluno, sexo, ano_aluno, turma_aluno, status,
--                     data_emprestimo, data_prevista_devolucao,
--                     data_devolucao, dias_emprestimo, atrasado,
--                     sem_data_definida)
--   pessoas         — Cadastro de alunos e funcionários (nome, sexo,
--                     ano, turma, eh_funcionario, pcd, data_cadastro)
--   admins          — Perfil do bibliotecário autenticado (id → auth.users,
--                     nome, foto_url)
--   configuracoes   — Configurações gerais (chave, valor) — uso futuro
--   config_privada  — Chaves de API (groq_api_key, imgbb_api_key)
--                     com RLS: somente usuários autenticados leem
--
-- SEGURANÇA (RLS)
--   • livros, emprestimos, pessoas: leitura pública; escrita autenticada
--   • admins: leitura e escrita apenas pelo próprio usuário autenticado
--   • config_privada: somente autenticados leem
--
-- TRIGGERS / FUNÇÕES
--   • atualizar_quantidade_disponivel(): recalcula quantidade_disponivel
--     nos livros após INSERT/UPDATE/DELETE em emprestimos
--   • atualizar_atrasado(): marca emprestimos.atrasado = true quando
--     data_prevista_devolucao < now() e status = 'emprestado'
--
-- ============================================================================


-- 0. EXTENSÕES NECESSÁRIAS
CREATE EXTENSION IF NOT EXISTS unaccent; -- busca sem acento (usada no script de limpeza)

-- 1. TABELA DE LIVROS
CREATE TABLE IF NOT EXISTS livros (
    id BIGINT PRIMARY KEY,
    isbn TEXT,
    imagem_url TEXT,
    pdf_url TEXT,
    titulo TEXT NOT NULL,
    autor TEXT,
    categoria TEXT,
    prateleira TEXT,
    palavras_chave TEXT[] DEFAULT '{}',
    alt_text TEXT,
    quantidade_total INTEGER NOT NULL DEFAULT 1,
    quantidade_disponivel INTEGER NOT NULL DEFAULT 1,
    data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABELA DE EMPRÉSTIMOS
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
    status TEXT DEFAULT 'emprestado',
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
CREATE POLICY "Leitura autenticada de livros_excluidos" ON livros_excluidos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Escrita autenticada de livros_excluidos" ON livros_excluidos FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Leitura pública de livros" ON livros;
DROP POLICY IF EXISTS "Escrita autenticada de livros" ON livros;
CREATE POLICY "Leitura pública de livros" ON livros FOR SELECT USING (true);
CREATE POLICY "Escrita autenticada de livros" ON livros FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Leitura pública de emprestimos" ON emprestimos;
DROP POLICY IF EXISTS "Escrita autenticada de emprestimos" ON emprestimos;
CREATE POLICY "Leitura pública de emprestimos" ON emprestimos FOR SELECT USING (true);
CREATE POLICY "Escrita autenticada de emprestimos" ON emprestimos FOR ALL USING (auth.role() = 'authenticated');

-- 5. TRIGGER DE DISPONIBILIDADE
-- Recalcula quantidade_disponivel automaticamente a cada mudança nos empréstimos.
CREATE OR REPLACE FUNCTION recalcular_disponivel()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE livros SET quantidade_disponivel = quantidade_total - (
            SELECT COUNT(*) FROM emprestimos
            WHERE livro_id = OLD.livro_id AND status = 'emprestado'
        ) WHERE id = OLD.livro_id;
        RETURN OLD;
    ELSE
        UPDATE livros SET quantidade_disponivel = quantidade_total - (
            SELECT COUNT(*) FROM emprestimos
            WHERE livro_id = NEW.livro_id AND status = 'emprestado'
        ) WHERE id = NEW.livro_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_atualizar_disponivel ON emprestimos;
CREATE TRIGGER trigger_atualizar_disponivel
AFTER INSERT OR UPDATE OR DELETE ON emprestimos
FOR EACH ROW EXECUTE FUNCTION recalcular_disponivel();

-- 6. COLUNAS ADICIONAIS
-- Seguro executar mesmo se o banco já existia — IF NOT EXISTS evita erros.
ALTER TABLE livros ADD COLUMN IF NOT EXISTS imagem_url TEXT;
ALTER TABLE livros ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE livros ADD COLUMN IF NOT EXISTS alt_text TEXT;
ALTER TABLE livros ADD COLUMN IF NOT EXISTS prateleira TEXT;
ALTER TABLE livros ADD COLUMN IF NOT EXISTS data_edicao TIMESTAMP WITH TIME ZONE;

-- 7. TABELA DE PESSOAS (alunos e funcionários)
CREATE TABLE IF NOT EXISTS pessoas (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    sexo CHAR(1) NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('aluno', 'funcionario')),
    ano_aluno INTEGER,
    turma_aluno TEXT,
    pcd BOOLEAN DEFAULT FALSE,
    data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS pcd BOOLEAN DEFAULT FALSE;
DROP POLICY IF EXISTS "Leitura pública de pessoas" ON pessoas;
DROP POLICY IF EXISTS "Escrita autenticada de pessoas" ON pessoas;
CREATE POLICY "Leitura pública de pessoas" ON pessoas FOR SELECT USING (true);
CREATE POLICY "Escrita autenticada de pessoas" ON pessoas FOR ALL USING (auth.role() = 'authenticated');

-- 8. REALTIME
-- Habilita atualizações em tempo real para todas as tabelas.
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
    ON config_privada
    FOR SELECT
    TO authenticated
    USING (true);

-- Ninguém (nem autenticado) pode inserir/alterar/deletar via API
-- Só você pelo Dashboard do Supabase

-- ============================================================================
-- 11. TABELA DE ADMINS SECUNDÁRIOS
-- Vincula UUID do Supabase Auth ao nome e foto de perfil do admin.
-- Os dados (UUID + nome) são inseridos manualmente no SQL Editor após criar
-- o usuário em Authentication > Users no Dashboard do Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admins (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    nome TEXT NOT NULL,
    foto_url TEXT
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin lê próprio perfil" ON admins;
CREATE POLICY "Admin lê próprio perfil"
    ON admins FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admin atualiza própria foto" ON admins;
CREATE POLICY "Admin atualiza própria foto"
    ON admins FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Para inserir um novo admin secundário após criar o usuário no Auth:
-- INSERT INTO admins (id, nome) VALUES ('uuid-do-usuario', 'Nome do Admin');
