/**
 * BibVania — bibvania.js
 * ===========================================================================
 * Módulo central do sistema. Reúne três responsabilidades:
 *
 *   1. TRANSIÇÃO DE PÁGINA  — overlay animado exibido entre navegações,
 *      com logo pulsante e bolinhas saltitantes. Sobrepõe window.navegarCom.
 *
 *   2. ACESSIBILIDADE       — busca por voz (Web Speech API), live region
 *      para anúncios a leitores de tela, e função spanCategoria que converte
 *      nomes de categoria em badges coloridos semanticamente.
 *
 *   3. BANCO DE DADOS       — objeto DB exportado como default. Encapsula
 *      todas as operações Supabase: autenticação, CRUD de livros,
 *      empréstimos, devoluções, pessoas, upload/remoção de capas e PDFs
 *      e canais Realtime.
 *
 * Unifica: database.js · bibvania-utils.js · bibvania-transition.js
 *
 * Importado como ES Module pelos três arquivos principais (index, admin, login).
 * Também carregado como script UMD no final de cada página para retrocompatibilidade
 * com chamadas síncronas de outros scripts inline.
 *
 * @author  emtivania <https://github.com/ruanolima>
 * @version 1.8
 * @year    2026
 * @license CC-BY-4.0 <https://creativecommons.org/licenses/by/4.0/>
 * @source  https://github.com/emtivania/bibvania
 */

// ============================================================================
// TRANSIÇÃO DE PÁGINA
// ----------------------------------------------------------------------------
// Cria um overlay (#_bv-transition) injetado no <body> de qualquer página que
// carregue este script. Quando window.navegarCom(url) é chamado, o overlay
// aparece em 100ms (fade-in) antes de redirecionar — evitando a troca brusca
// de URL. O overlay some automaticamente no evento "pageshow" (inclui bfcache).
// ============================================================================

(function () {
    const overlay = document.createElement('div');
    overlay.id = '_bv-transition';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <img src="logo.png" alt="" id="_bv-transition-logo">
        <div id="_bv-transition-dots">
            <span></span><span></span><span></span>
        </div>
    `;
    document.body.appendChild(overlay);

    const style = document.createElement('style');
    style.textContent = `
        #_bv-transition {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: var(--bg, #0f172a);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1.5rem;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.1s ease;
        }
        #_bv-transition.ativo {
            opacity: 1;
            pointer-events: all;
        }
        #_bv-transition-logo {
            width: 80px;
            height: auto;
            animation: _bv-pulse 0.6s ease-in-out infinite;
        }
        #_bv-transition-dots {
            display: flex;
            gap: 0.5rem;
        }
        #_bv-transition-dots span {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #2563eb;
            opacity: 0.3;
            animation: _bv-bounce 0.9s ease-in-out infinite;
        }
        /* 1/3 do ciclo de 0.9s = 0.3s entre cada bolinha */
        #_bv-transition-dots span:nth-child(1) { animation-delay: -0.6s; }
        #_bv-transition-dots span:nth-child(2) { animation-delay: -0.3s; }
        #_bv-transition-dots span:nth-child(3) { animation-delay:    0s; }
        @keyframes _bv-pulse {
            0%, 100% { transform: scale(1);   opacity: 1; }
            50%       { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes _bv-bounce {
            0%, 100% { transform: translateY(0);     opacity: 0.3; }
            50%       { transform: translateY(-10px); opacity: 1;   }
        }
    `;
    document.head.appendChild(style);

    /** Torna o body visível (opacity 1) e chama cb() após a transição — evita FOUC enquanto o módulo carrega. */
    function mostrar(cb) {
        overlay.classList.add('ativo');
        setTimeout(cb, 140);
    }

    /** Redireciona para url. Exposta em window para uso por onclick inline no HTML antes do módulo ES estar pronto. */
    window.navegarCom = function (url) {
        if (!url) return;
        mostrar(() => { window.location.href = url; });
    };

    window.addEventListener('pageshow', () => {
        overlay.classList.remove('ativo');
    });
})();

// ============================================================================
// UTILITÁRIOS DE ACESSIBILIDADE — BUSCA POR VOZ
// ----------------------------------------------------------------------------
// iniciarBuscaVoz(inputEl, onResult): injeta um botão de microfone ao lado do
// campo de busca. Usa a Web Speech API (SpeechRecognition). O botão só aparece
// em navegadores que suportam a API; em outros, nenhum elemento é adicionado.
// Anuncia estados (ouvindo / resultado / erro) via live region ARIA para
// compatibilidade com leitores de tela.
//
// _anunciar(texto): atualiza a live region global #_bv-live (aria-live="polite").
// ============================================================================

/** Anuncia texto para leitores de tela via live region */
function _anunciar(texto) {
    let live = document.getElementById('_bv-live');
    if (!live) {
        live = document.createElement('div');
        live.id = '_bv-live';
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('aria-atomic', 'true');
        live.className = 'visually-hidden';
        document.body.appendChild(live);
    }
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = texto; });
}

/** SVG do microfone */
function _micSVG() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>`;
}

/**
 * Cria um botão de microfone e o injeta no wrapper do input.
 * @param {HTMLInputElement} inputEl  — campo de busca alvo
 * @param {Function} onResult        — callback(texto) após reconhecimento
 */
/**
 * iniciarBuscaVoz(inputEl, onResult)
 * Ativa a busca por voz via Web Speech API no campo inputEl.
 * Insere botão 🎤 ao lado do input; ao clicar, inicia reconhecimento pt-BR.
 * Chama onResult() após preencher o valor reconhecido.
 * Graceful degradation: oculta o botão se a API não estiver disponível.
 */
export function iniciarBuscaVoz(inputEl, onResult) {
    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return; // navegador não suporta — botão não aparece

    const wrap = inputEl.parentElement;
    // Guard: evita duplicar o botão se já foi inicializado
    if (wrap.querySelector('.voice-btn')) return;
    wrap.classList.add('search-voice-wrap');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-btn';
    btn.setAttribute('aria-label', 'Buscar por voz');
    btn.setAttribute('title', 'Buscar por voz');
    btn.innerHTML = _micSVG();
    wrap.appendChild(btn);

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let ouvindo = false;

    btn.addEventListener('click', () => {
        if (ouvindo) { recognition.stop(); return; }
        recognition.start();
    });

    recognition.addEventListener('start', () => {
        ouvindo = true;
        btn.classList.add('ouvindo');
        btn.setAttribute('aria-label', 'Parar gravação de voz');
        btn.setAttribute('aria-pressed', 'true');
        _anunciar('Ouvindo…');
    });

    recognition.addEventListener('result', (e) => {
        const texto = e.results[0][0].transcript.trim();
        inputEl.value = texto;
        onResult(texto);
        _anunciar(`Buscando por: ${texto}`);
    });

    recognition.addEventListener('end', () => {
        ouvindo = false;
        btn.classList.remove('ouvindo');
        btn.setAttribute('aria-label', 'Buscar por voz');
        btn.removeAttribute('aria-pressed');
    });

    recognition.addEventListener('error', (e) => {
        ouvindo = false;
        btn.classList.remove('ouvindo');
        btn.setAttribute('aria-label', 'Buscar por voz');
        if (e.error !== 'aborted') {
            _anunciar('Não foi possível reconhecer a voz. Tente novamente.');
        }
    });
}

// ============================================================================
// COR POR CATEGORIA
// ----------------------------------------------------------------------------
// _CAT_CORES: mapa categoria → { bg, text } usado por spanCategoria().
// As cores seguem a hierarquia pedagógica:
//   • Paradidáticos: Infantil=amarelo, Infantojuvenil=verde, Juvenil=vermelho,
//     Jovem Adulto=laranja, EJA Fund=roxo, EJA Médio=rosa, Referência=cinza
//   • Didáticos por série: herdam a cor do nível paradidático equivalente
//
// spanCategoria(categoria): retorna uma string HTML <span> com a cor aplicada
// via style inline. Retorna string vazia se categoria for nula/vazia.
// ============================================================================

const _CAT_CORES = {
    // ── Paradidáticos ─────────────────────────────────────────────────────────

    'INFANTIL (1º AO 4º)':          { bg: '#a16207', text: '#fff' }, // amarelo escuro
    'INFANTOJUVENIL (5º E 6º)':     { bg: '#15803d', text: '#fff' }, // verde escuro
    'JUVENIL (7º AO 9º)':           { bg: '#b91c1c', text: '#fff' }, // vermelho escuro
    'JOVEM ADULTO (ENSINO MÉDIO)':  { bg: '#c2410c', text: '#fff' }, // laranja escuro
    'EJA (FUNDAMENTAL)':            { bg: '#7e22ce', text: '#fff' }, // roxo escuro
    'EJA (MÉDIO)':                  { bg: '#be185d', text: '#fff' }, // rosa escuro
    'DE REFERÊNCIA':                { bg: '#334155', text: '#fff' }, // cinza escuro
    'CLÁSSICOS':                    { bg: '#78350f', text: '#fff' }, // marrom escuro
    'REGIONAIS':                    { bg: '#0f172a', text: '#fff' }, // preto
    'POESIA':                       { bg: '#0f766e', text: '#fff' }, // teal escuro

    // ── Didáticos EF (herdam cor do nível paradidático) ───────────────────────
    'DIDÁTICO (EF 1º)':             { bg: '#a16207', text: '#fff' }, // amarelo escuro → INFANTIL
    'DIDÁTICO (EF 2º)':             { bg: '#a16207', text: '#fff' },
    'DIDÁTICO (EF 3º)':             { bg: '#a16207', text: '#fff' },
    'DIDÁTICO (EF 4º)':             { bg: '#a16207', text: '#fff' },
    'DIDÁTICO (EF 5º)':             { bg: '#15803d', text: '#fff' }, // verde escuro → INFANTOJUVENIL
    'DIDÁTICO (EF 6º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EF 7º)':             { bg: '#b91c1c', text: '#fff' }, // vermelho escuro → JUVENIL
    'DIDÁTICO (EF 8º)':             { bg: '#b91c1c', text: '#fff' },
    'DIDÁTICO (EF 9º)':             { bg: '#b91c1c', text: '#fff' },
    'DIDÁTICO (EM 1º)':             { bg: '#c2410c', text: '#fff' }, // laranja escuro → JOVEM ADULTO
    'DIDÁTICO (EM 2º)':             { bg: '#c2410c', text: '#fff' },
    'DIDÁTICO (EM 3º)':             { bg: '#c2410c', text: '#fff' },
    'DIDÁTICO (EJAF)':              { bg: '#7e22ce', text: '#fff' }, // roxo escuro → EJA FUNDAMENTAL
    'DIDÁTICO (EJAM)':              { bg: '#be185d', text: '#fff' }, // rosa escuro → EJA MÉDIO
};

/**
 * Retorna um <span> HTML com a cor de fundo e texto da categoria.
 * @param {string} categoria
 * @returns {string} HTML string
 */
/**
 * spanCategoria(categoria)
 * Retorna um <span> HTML com a categoria formatada e cor de fundo por grupo
 * (Literatura, Ciências, Referência, etc.). Usado em cards de livro.
 */
export function spanCategoria(categoria) {
    if (!categoria) return '';
    const cor = _CAT_CORES[categoria];
    if (!cor) return `<span style="font-weight:700;">${categoria}</span>`;
    return `<span style="color:${cor.bg};font-weight:700;overflow-wrap:break-word;word-break:break-word;">${categoria}</span>`;
}

// ============================================================================
// BANCO DE DADOS — SUPABASE
// ============================================================================

const supabaseUrl = "https://zkscdfqsqhxldxlmklum.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprc2NkZnFzcWh4bGR4bG1rbHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDcyNTIsImV4cCI6MjA5Mjg4MzI1Mn0._wj1RPztdx_TIlcb37qIQlRZVyHS6frq98LPRZt1Yx8";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// CONSTANTES
// ----------------------------------------------------------------------------
// CATEGORIAS_FIXAS: lista canônica de todas as 22 categorias aceitas pelo
// sistema, na ordem exibida em selects. Exportada como DB.CATEGORIAS.
// ============================================================================

const CATEGORIAS_FIXAS = [
    'INFANTIL (1º AO 4º)', 'INFANTOJUVENIL (5º E 6º)',
    'JUVENIL (7º AO 9º)', 'JOVEM ADULTO (ENSINO MÉDIO)',
    'DIDÁTICO (EF 1º)', 'DIDÁTICO (EF 2º)', 'DIDÁTICO (EF 3º)', 'DIDÁTICO (EF 4º)',
    'DIDÁTICO (EF 5º)', 'DIDÁTICO (EF 6º)', 'DIDÁTICO (EF 7º)', 'DIDÁTICO (EF 8º)',
    'DIDÁTICO (EF 9º)', 'DIDÁTICO (EM 1º)', 'DIDÁTICO (EM 2º)', 'DIDÁTICO (EM 3º)',
    'DIDÁTICO (EJAF)', 'DIDÁTICO (EJAM)',
    'DE REFERÊNCIA', 'CLÁSSICOS', 'REGIONAIS', 'POESIA'
];

// ============================================================================
// HELPERS INTERNOS
// ----------------------------------------------------------------------------
// toUpper(val): converte string para maiúsculas com trim. Retorna o valor
// original se não for string (evita erros em campos numéricos/nulos).
//
// _CAMPOS_CASE_SENSITIVE: Set de campos cujos valores NÃO devem ser
// convertidos para maiúsculas (URLs de imagens, PDFs, alt_text etc.).
//
// padronizarObjeto(obj): aplica toUpper em todos os campos string do objeto,
// exceto os campos em _CAMPOS_CASE_SENSITIVE. Também normaliza palavras_chave
// para minúsculas, trim e limite de 25 caracteres por tag.
// ============================================================================

const toUpper = (val) => (val && typeof val === 'string') ? val.toUpperCase().trim() : val;

const _CAMPOS_CASE_SENSITIVE = new Set(['imagem_url', 'pdf_url', 'alt_text', 'foto_url']);

const padronizarObjeto = (obj) => {
    const novoObj = { ...obj };
    for (let key in novoObj) {
        if (typeof novoObj[key] === 'string' && !_CAMPOS_CASE_SENSITIVE.has(key)) {
            novoObj[key] = toUpper(novoObj[key]);
        }
    }
    if (Array.isArray(novoObj.palavras_chave)) {
        novoObj.palavras_chave = novoObj.palavras_chave.map(
            p => typeof p === 'string' ? p.toLowerCase().trim().slice(0, 25) : p
        );
    }
    return novoObj;
};

// ============================================================================
// OBJETO DB
// ----------------------------------------------------------------------------
// Exportado como default e também exposto em window.DB para scripts inline.
// Agrupa todos os métodos de acesso ao Supabase em categorias:
//
//   AUTENTICAÇÃO  — signIn, signOut, getSession, checkAuth, redirectIfLoggedIn,
//                   onAuthStateChange
//   LIVROS        — getLivros, getLivroPorId, getCapa, getIdsComCapa, getCapas,
//                   getCapaUnica, getProximoIdDisponivel, salvarLivro,
//                   atualizarLivro, excluirLivro
//   EMPRÉSTIMOS   — registrarEmprestimo, atualizarEmprestimo, excluirEmprestimo,
//                   registrarDevolucao, getEmprestimos, getHistoricoPessoa,
//                   getEmprestimosAtivosComLivro, getEmprestimosAtivos
//   REALTIME      — onLivrosChange, onEmprestimosChange, onPessoasChange
//   STORAGE       — (métodos de upload/remoção estão em admin.html via _iaUploadImgbb)
//   PESSOAS       — getPessoas, salvarPessoa, excluirPessoa, atualizarPessoa
// ============================================================================

const DB = {
    CATEGORIAS: CATEGORIAS_FIXAS,
    supabase: supabase,

    /**
     * _fetchAll(query): Função utilitária interna para buscar TODOS os registros de uma tabela,
     * contornando o limite padrão de 1000 registros do Supabase através de paginação automática.
     */
    async _fetchAll(query) {
        let allData = [];
        let from = 0;
        let step = 1000;
        while (true) {
            const { data, error } = await query.range(from, from + step - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            allData = allData.concat(data);
            if (data.length < step) break;
            from += step;
        }
        return allData;
    },

    // ── Autenticação ──────────────────────────────────────────────────────────
    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    async signOut() {
        // Marca que o logout foi intencional antes de chamar o Supabase
        sessionStorage.setItem('bibvania_signout_intencional', '1');
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        sessionStorage.removeItem('bibvania_tab');
        localStorage.removeItem('bibvania_admin_nome');
        (window.navegarCom || (u => window.location.href = u))('login.html');
    },

    async getSession() {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session;
    },

    async checkAuth() {
        let session = await this.getSession();
        // Se não há sessão, tenta renovar o token antes de redirecionar
        if (!session) {
            try {
                const { data } = await supabase.auth.refreshSession();
                session = data?.session ?? null;
            } catch (_) {
                session = null;
            }
        }
        if (!session) {
            sessionStorage.removeItem('bibvania_tab');
            localStorage.removeItem('bibvania_admin_nome');
            (window.navegarCom || (u => window.location.href = u))('login.html');
            return null;
        }
        return session;
    },

    async redirectIfLoggedIn() {
        const session = await this.getSession();
        if (session) {
            (window.navegarCom || (u => window.location.href = u))('admin.html');
        }
    },

    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange(callback);
    },

    // ── Livros ────────────────────────────────────────────────────────────────
    async getLivros() {
        try {
            const query = supabase
                .from("livros")
                .select("id, titulo, autor, isbn, categoria, prateleira, quantidade_total, quantidade_disponivel, palavras_chave, alt_text, imagem_url, pdf_url, data_cadastro, data_edicao")
                .order("data_edicao", { ascending: false, nullsFirst: false })
                .order("data_cadastro", { ascending: false });
            return await this._fetchAll(query);
        } catch (error) {
            console.error("Erro ao listar livros:", error.message);
            throw error;
        }
    },

    async getLivroPorId(id) {
        const { data, error } = await supabase.from("livros").select("*").eq("id", id).single();
        if (error) return null;
        return data;
    },

    async getCapa(id) {
        const { data, error } = await supabase.from("livros").select("imagem_url").eq("id", id).single();
        if (error || !data) return null;
        return data.imagem_url || null;
    },

    async getIdsComCapa() {
        const { data } = await supabase
            .from("livros").select("id").not("imagem_url", "is", null).neq("imagem_url", "");
        return new Set((data || []).map(l => l.id));
    },

    async getCapas(ids) {
        if (!ids || ids.length === 0) return {};
        const { data, error } = await supabase
            .from("livros").select("id, imagem_url").in("id", ids)
            .not("imagem_url", "is", null).neq("imagem_url", "");
        if (error || !data) return {};
        const map = {};
        data.forEach(l => { if (l.imagem_url) map[l.id] = l.imagem_url; });
        return map;
    },

    async getCapaUnica(id) {
        const { data, error } = await supabase.from("livros").select("imagem_url").eq("id", id).single();
        if (error || !data) return null;
        return data.imagem_url || null;
    },

    async getProximoIdDisponivel() {
        const { data, error } = await supabase.from("livros").select("id").order("id", { ascending: true });
        if (error) throw error;
        if (!data || data.length === 0) return 1;
        const ids = new Set(data.map(r => r.id));
        let candidato = 1;
        while (ids.has(candidato)) candidato++;
        return candidato;
    },

    /**
     * Salva um livro novo ou mescla com um existente de mesmo título (case-insensitive).
     * Se o título já existir: incrementa quantidade_total e quantidade_disponivel,
     * atualizando metadados ausentes. Se não existir: insere com novo ID autogerido.
     * @param {Object} livro — objeto livro (campos em UPPER_SNAKE_CASE após padronização)
     * @returns {{ action: 'added'|'updated', data: Object }}
     */
    async salvarLivro(livro) {
        try {
            livro = padronizarObjeto(livro);
            const { data: existente } = await supabase
                .from("livros").select("*").ilike("titulo", livro.titulo).maybeSingle();

            if (existente) {
                const novaQuantidadeTotal     = parseInt(existente.quantidade_total)     + parseInt(livro.quantidade_total);
                const novaQuantidadeDisponivel = parseInt(existente.quantidade_disponivel) + parseInt(livro.quantidade_total);
                const { data, error } = await supabase
                    .from("livros")
                    .update({
                        quantidade_total:      novaQuantidadeTotal,
                        quantidade_disponivel: novaQuantidadeDisponivel,
                        autor:          livro.autor          || existente.autor,
                        isbn:           livro.isbn           || existente.isbn,
                        categoria:      livro.categoria      || existente.categoria,
                        prateleira:     livro.prateleira     !== undefined ? livro.prateleira : existente.prateleira,
                        palavras_chave: livro.palavras_chave?.length ? livro.palavras_chave : existente.palavras_chave,
                        alt_text:       livro.alt_text       || existente.alt_text,
                    })
                    .eq("id", existente.id).select().single();
                if (error) throw error;
                return { action: "updated", data };
            } else {
                const novoId = await this.getProximoIdDisponivel();
                livro.id = novoId;
                livro.quantidade_disponivel = livro.quantidade_total;
                livro.data_cadastro = new Date().toISOString();
                const { data, error } = await supabase.from("livros").insert([livro]).select().single();
                if (error) throw error;
                return { action: "added", data };
            }
        } catch (error) {
            console.error("Erro ao salvar livro:", error);
            throw error;
        }
    },

    /**
     * Atualiza os metadados de um livro existente.
     * Recalcula quantidade_disponivel automaticamente com base nos empréstimos ativos:
     *   quantidade_disponivel = quantidade_total − empréstimos com status='emprestado'
     * imagem_url e pdf_url só são enviados no payload se explicitamente presentes no objeto.
     * @param {Object} livro — objeto livro com id obrigatório
     * @returns {Object} registro atualizado retornado pelo Supabase
     */
    async atualizarLivro(livro) {
        try {
            livro = padronizarObjeto(livro);
            const { count, error: countError } = await supabase
                .from("emprestimos").select("*", { count: 'exact', head: true })
                .eq("livro_id", livro.id).eq("status", "emprestado");
            if (countError) throw countError;
            livro.quantidade_disponivel = livro.quantidade_total - (count || 0);

            const { imagem_url, pdf_url, ...livroSemImagem } = livro;
            const updatePayload = { ...livroSemImagem, data_edicao: new Date().toISOString() };
            if (imagem_url !== undefined) updatePayload.imagem_url = imagem_url;
            if (pdf_url    !== undefined) updatePayload.pdf_url    = pdf_url;

            const { data, error } = await supabase
                .from("livros").update(updatePayload).eq("id", livro.id).select().single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error("Erro ao atualizar livro:", error);
            throw error;
        }
    },

    /**
     * Exclui um livro e seus empréstimos históricos do banco.
     * Bloqueia a exclusão se houver empréstimos com status='emprestado',
     * lançando um Error com a lista de alunos/datas para o chamador exibir.
     * Remove também os arquivos de capa e PDF do Internet Archive, se existirem.
     * @param {number} id — ID do livro a excluir
     * @returns {true} em caso de sucesso
     * @throws {Error} se houver empréstimos ativos
     */
    async excluirLivro(id) {
        try {
            const { data: ativos, error: empError } = await supabase
                .from("emprestimos").select("id, nome_aluno, data_emprestimo")
                .eq("livro_id", id).eq("status", "emprestado");
            if (empError) throw empError;

            if (ativos && ativos.length > 0) {
                const lista = ativos.map(e => {
                    const data = e.data_emprestimo
                        ? new Date(e.data_emprestimo).toLocaleDateString("pt-BR") : "\u2014";
                    return "\u2022 " + e.nome_aluno + " (desde " + data + ")";
                }).join("\n");
                throw new Error(
                    "IMPOSSÍVEL EXCLUIR: EXISTEM " + ativos.length + " EMPRÉSTIMO(S) ATIVO(S):\n" +
                    lista + "\n\nExclua o(s) empréstimo(s) primeiro."
                );
            }

            // Capas/PDFs ficam no ImgBB — não há API pública de deleção, os arquivos orfãos permanecem lá sem custo.
            await supabase.from("emprestimos").delete().eq("livro_id", id);

            const { error } = await supabase.from("livros").delete().eq("id", id);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error("Erro ao excluir livro:", error.message);
            throw error;
        }
    },

    // ── Empréstimos ───────────────────────────────────────────────────────────
    async registrarEmprestimo(emprestimo) {
        try {
            emprestimo = padronizarObjeto(emprestimo);
            const { data: livro, error: livroError } = await supabase
                .from("livros").select("*").eq("id", emprestimo.livro_id).single();
            if (livroError || !livro || livro.quantidade_disponivel <= 0)
                throw new Error("LIVRO INDISPONÍVEL OU NÃO ENCONTRADO");

            emprestimo.status = "emprestado";

            if (emprestimo.sem_data_definida) {
                emprestimo.data_prevista_devolucao = null;
                emprestimo.dias_emprestimo = 0;
            } else {
                const baseDate = emprestimo.data_emprestimo ? new Date(emprestimo.data_emprestimo) : new Date();
                const dataPrevista = new Date(baseDate);
                dataPrevista.setDate(dataPrevista.getDate() + parseInt(emprestimo.dias_emprestimo));
                emprestimo.data_prevista_devolucao = dataPrevista.toISOString();
            }

            const { data: emprestimoData, error: emprestimoError } = await supabase
                .from("emprestimos").insert([emprestimo]).select().single();
            if (emprestimoError) throw emprestimoError;
            return emprestimoData.id;
        } catch (error) {
            console.error("Erro ao registrar empréstimo:", error);
            throw error;
        }
    },

    async atualizarEmprestimo(emprestimo) {
        try {
            const updateData = {};
            if (emprestimo.nome_aluno)              updateData.nome_aluno    = String(emprestimo.nome_aluno).toUpperCase();
            if (emprestimo.sexo)                    updateData.sexo          = String(emprestimo.sexo);
            if (emprestimo.ano_aluno  !== undefined) updateData.ano_aluno    = parseInt(emprestimo.ano_aluno);
            if (emprestimo.turma_aluno)              updateData.turma_aluno  = String(emprestimo.turma_aluno).toUpperCase();
            if (emprestimo.dias_emprestimo !== undefined) updateData.dias_emprestimo = parseInt(emprestimo.dias_emprestimo);
            if (emprestimo.sem_data_definida !== undefined) updateData.sem_data_definida = emprestimo.sem_data_definida;
            if (emprestimo.data_emprestimo)         updateData.data_emprestimo = emprestimo.data_emprestimo;

            if (emprestimo.sem_data_definida) {
                updateData.data_prevista_devolucao = null;
            } else if (emprestimo.data_prevista_devolucao) {
                updateData.data_prevista_devolucao = emprestimo.data_prevista_devolucao;
            } else if (emprestimo.dias_emprestimo) {
                const baseCalc = emprestimo.data_emprestimo ? new Date(emprestimo.data_emprestimo) : new Date();
                baseCalc.setDate(baseCalc.getDate() + parseInt(emprestimo.dias_emprestimo));
                updateData.data_prevista_devolucao = baseCalc.toISOString();
            }

            const { data, error } = await supabase
                .from("emprestimos").update(updateData).eq("id", emprestimo.id).select().single();
            if (error) throw error;
            return data;
        } catch (error) {
            throw error;
        }
    },

    async excluirEmprestimo(emprestimoId) {
        try {
            const { error: empError } = await supabase.from("emprestimos").select("*").eq("id", emprestimoId).single();
            if (empError) throw empError;
            const { error } = await supabase.from("emprestimos").delete().eq("id", emprestimoId);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error("Erro ao excluir empréstimo:", error);
            throw error;
        }
    },

    async registrarDevolucao(emprestimoId, dataDevolucao) {
        try {
            const { error: empError } = await supabase.from("emprestimos").select("*").eq("id", emprestimoId).single();
            if (empError) throw empError;
            const { data, error } = await supabase
                .from("emprestimos")
                .update({ status: "devolvido", data_devolucao: dataDevolucao })
                .eq("id", emprestimoId).select().single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error("Erro ao registrar devolução:", error);
            throw error;
        }
    },

    async getEmprestimos() {
        try {
            const query = supabase.from("emprestimos").select("*").order("data_emprestimo", { ascending: false });
            return await this._fetchAll(query);
        } catch (error) {
            console.error("Erro ao listar empréstimos:", error);
            throw error;
        }
    },

    async getHistoricoPessoa(nomeAluno) {
        try {
            const { data, error } = await supabase
                .from("emprestimos")
                .select("id, livro_id, status, data_emprestimo, data_devolucao, livros(titulo)")
                .ilike("nome_aluno", nomeAluno)
                .order("data_emprestimo", { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error("Erro ao buscar histórico:", error);
            return [];
        }
    },

    async getEmprestimosAtivosComLivro() {
        try {
            const { data, error } = await supabase
                .from("emprestimos")
                .select("*, livros(titulo, autor, categoria)")
                .eq("status", "emprestado")
                .order("ano_aluno",   { ascending: true })
                .order("turma_aluno", { ascending: true })
                .order("nome_aluno",  { ascending: true });
            if (error) throw error;
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            return (data || []).map(e => {
                if (e.data_prevista_devolucao) {
                    const d = new Date(e.data_prevista_devolucao); d.setHours(0, 0, 0, 0);
                    if (d < hoje) e.atrasado = true;
                }
                return e;
            });
        } catch (error) {
            console.error("Erro ao buscar empréstimos com livro:", error);
            throw error;
        }
    },

    async getEmprestimosAtivos(livroId = null) {
        try {
            let query = supabase
                .from("emprestimos").select("*").eq("status", "emprestado")
                .order("data_emprestimo", { ascending: false });
            if (livroId) query = query.eq("livro_id", livroId);
            const data = await this._fetchAll(query);
            const hojeZero = new Date(); hojeZero.setHours(0, 0, 0, 0);
            return (data || []).map(e => {
                if (e.data_prevista_devolucao) {
                    const d = new Date(e.data_prevista_devolucao); d.setHours(0, 0, 0, 0);
                    if (d < hojeZero) e.atrasado = true;
                }
                return e;
            });
        } catch (error) {
            console.error("Erro ao listar empréstimos ativos:", error);
            throw error;
        }
    },

    // ── Realtime ──────────────────────────────────────────────────────────────
    onLivrosChange(callback) {
        return supabase.channel('livros-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'livros' }, callback)
            .subscribe();
    },

    onEmprestimosChange(callback) {
        return supabase.channel('emprestimos-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'emprestimos' }, callback)
            .subscribe();
    },

    onPessoasChange(callback) {
        return supabase.channel('pessoas-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pessoas' }, callback)
            .subscribe();
    },


    // ── Pessoas ───────────────────────────────────────────────────────────────
    async getPessoas() {
        try {
            const query = supabase.from('pessoas').select('*').order('nome', { ascending: true });
            return await this._fetchAll(query);
        } catch (error) {
            console.error("Erro ao listar pessoas:", error);
            throw error;
        }
    },

    async salvarPessoa(pessoa) {
        const { data, error } = await supabase.from('pessoas').insert([pessoa]).select().single();
        if (error) throw error;
        return data;
    },

    async excluirPessoa(id) {
        const { data: pessoa } = await supabase.from('pessoas').select('nome').eq('id', id).single();
        if (pessoa && pessoa.nome) {
            await supabase.from('emprestimos').delete().ilike('nome_aluno', pessoa.nome.trim());
        }
        const { error } = await supabase.from('pessoas').delete().eq('id', id);
        if (error) throw error;
    },

    async atualizarPessoa(pessoa) {
        const { id, ...campos } = pessoa;
        const { data, error } = await supabase.from('pessoas').update(campos).eq('id', id).select().single();
        if (error) throw error;
        return data;
    }
};

window.DB = DB;
export default DB;
