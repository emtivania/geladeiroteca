/**
 * BibVânia Online — bibcore.js
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
 * @author  Ruan Oliveira Lima <https://www.instagram.com/ruanoliveiralima_/>
 * @version 3.0
 * @year    2026
 * @license CC-BY-SA-4.0 <https://creativecommons.org/licenses/by-sa/4.0/>
 * @source  https://github.com/limaoruan/bibvania
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
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
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
// COR POR CLASSIFICAÇÃO INDICATIVA
// ----------------------------------------------------------------------------
// _CAT_CORES: mapa categoria → { bg, text } usado por spanCategoria().
// As cores identificam as faixas usadas no acervo; o ClassInd oficial não
// classifica livros impressos, então esta aplicação usa as faixas como referência.
//
// spanCategoria(categoria): retorna uma string HTML <span> com a cor aplicada
// via style inline. Retorna string vazia se categoria for nula/vazia.
// ============================================================================

const _CAT_CORES = {
    // ── Classificação indicativa por idade ──────────────────────────────────

    'LIVRE':    { bg: '#15803d', text: '#fff' }, // verde escuro
    '6 ANOS':   { bg: '#0f766e', text: '#fff' }, // verde-azulado escuro
    '10 ANOS':  { bg: '#1e40af', text: '#fff' }, // azul escuro
    '12 ANOS':  { bg: '#a16207', text: '#fff' }, // amarelo escuro
    '14 ANOS':  { bg: '#c2410c', text: '#fff' }, // laranja escuro
    '16 ANOS':  { bg: '#b91c1c', text: '#fff' }, // vermelho escuro
    '18 ANOS':  { bg: '#000000', text: '#fff' }, // preto

    // ── Legado: valores antigos ainda presentes no banco → exibem pela faixa etária equivalente ──
    'INFANTIL (1º AO 4º)':          { bg: '#15803d', text: '#fff' }, // → LIVRE
    'INFANTOJUVENIL (5º E 6º)':     { bg: '#1e40af', text: '#fff' }, // → 10 ANOS
    'JUVENIL I (7º AO 9º)':           { bg: '#a16207', text: '#fff' }, // → 12 ANOS
    'JUVENIL II (ENSINO MÉDIO)':  { bg: '#c2410c', text: '#fff' }, // → 14 ANOS
    'MATERIAL PEDAGÓGICO':          { bg: '#15803d', text: '#fff' }, // → LIVRE
    'POESIA':                       { bg: '#15803d', text: '#fff' }, // → LIVRE
    'DE REFERÊNCIA':                { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EF 1º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EF 2º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EF 3º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EF 4º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EF 5º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EF 6º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EF 7º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EF 8º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EF 9º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EM 1º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EM 2º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EM 3º)':             { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EJAF)':              { bg: '#15803d', text: '#fff' },
    'DIDÁTICO (EJAM)':              { bg: '#15803d', text: '#fff' },
    'EJA (FUNDAMENTAL)':            { bg: '#15803d', text: '#fff' },
    'EJA (MÉDIO)':                  { bg: '#15803d', text: '#fff' },
    'CLÁSSICOS':                    { bg: '#1e40af', text: '#fff' },
    'REGIONAIS':                    { bg: '#1e40af', text: '#fff' },
    'CLÁSSICOS E REGIONAIS':        { bg: '#1e40af', text: '#fff' },
};

/**
 * Retorna um <span> HTML com a cor de fundo e texto da categoria.
 * @param {string} categoria
 * @returns {string} HTML string
 */
/**
 * spanCategoria(categoria)
 * Retorna um <span> HTML com a classificação indicativa formatada e cor de
 * fundo por faixa etária (Livre, 6 anos, 10 anos... 18 anos). Usado em
 * cards de livro.
 */
export function spanCategoria(categoria) {
    if (!categoria) return '';
    // Normaliza valores legados do banco para a faixa etária equivalente
    const _LEGADO_PARA_NOVO = /^INFANTIL \(1º AO 4º\)$/.test(categoria) ? 'LIVRE'
        : /^INFANTOJUVENIL \(5º E 6º\)$/.test(categoria) ? '10 ANOS'
        : /^JUVENIL I \(7º AO 9º\)$/.test(categoria) ? '12 ANOS'
        : /^JUVENIL II \(ENSINO MÉDIO\)$/.test(categoria) ? '14 ANOS'
        : /^MATERIAL PEDAGÓGICO$|^POESIA$|^DIDÁTICO|^DE REFERÊNCIA|^EJA/.test(categoria) ? 'LIVRE'
        : /^CLÁSSICOS$|^REGIONAIS$|^CLÁSSICOS E REGIONAIS$/.test(categoria) ? '10 ANOS'
        : null;
    const nomeExibido = _LEGADO_PARA_NOVO || categoria;
    const cor = _CAT_CORES[categoria] || _CAT_CORES[nomeExibido];
    if (!cor) return `<span style="font-weight:700;">${escapeHtml(nomeExibido)}</span>`;
    return `<span style="color:${cor.bg};font-weight:700;overflow-wrap:break-word;word-break:break-word;">${escapeHtml(nomeExibido)}</span>`;
}

/**
 * fmtAutor(autor, fallback)
 * Formata o autor para exibição em cards e listas. Quando o autor foi
 * marcado como "não identificado" no cadastro (valor salvo como "N/A"),
 * retorna string vazia — em vez de mostrar literalmente "N/A" — para que
 * o rótulo "AUTOR:" apareça em branco. Quando o autor está genuinamente
 * ausente (null/undefined), usa o `fallback` informado (padrão: '').
 * @param {string} autor - valor bruto do campo autor do livro
 * @param {string} [fallback=''] - texto a exibir quando autor está ausente
 * @returns {string}
 */
export function fmtAutor(autor, fallback = '') {
    // Valores "sem autor" (N/A e textos legados como "NÃO INFORMADO") aparecem em branco.
    const v = autor ? String(autor).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
    if (v === 'N/A' || v === 'NAO INFORMADO' || v === 'NAO INFORMADA') return '';
    return escapeHtml(autor || fallback);
}

/**
 * fmtVolumeEdicao(volume, edicao, opcoes)
 * Formata a linha "Volume: Xº   Edição: Yª".
 *
 * Sem `opcoes` (cards de livro — ACERVO e catálogo público): usa as mesmas
 * classes CSS dos demais campos do card (`.book-meta-item .book-meta-single`,
 * mesmo tamanho/fonte de AUTOR/ISBN/ClassInd), com rótulos em negrito.
 *
 * Com `opcoes` (listas compactas de EMPRÉSTIMO/DEVOLUÇÕES, que têm estilo
 * próprio): `{ estilo: 'css inline da linha', negrito: true|false }`.
 *
 * Em ambos os casos, Volume e Edição ficam lado a lado, sem separador "|",
 * com colunas ajustadas ao conteúdo e espaçamento horizontal de 1,5 caractere,
 * sem cortar valores. Valores ausentes ficam vazios, mas as colunas reservam
 * o espaço de `00º` e `00ª`, mantendo as posições fixas. A linha é sempre exibida.
 * @param {number|string} volume
 * @param {number|string} edicao
 * @param {{estilo?: string, negrito?: boolean}} [opcoes]
 * @returns {string} HTML string
 */
export function fmtVolumeEdicao(volume, edicao, opcoes) {
    const v = parseInt(volume, 10);
    const e = parseInt(edicao, 10);
    // Mantém as duas colunas estáveis sem exibir placeholder: valores vazios
    // ficam em branco, enquanto as colunas reservam espaço para `00º`/`00ª`.
    const volumeTxt = (Number.isFinite(v) && v > 0) ? `${String(v).padStart(2, '0')}º` : '';
    const edicaoTxt = (Number.isFinite(e) && e > 0) ? `${String(e).padStart(2, '0')}ª` : '';
    if (opcoes) {
        const rot = (t) => opcoes.negrito ? `<strong>${t}</strong>` : t;
        return `<div class="book-volume-edicao" style="display:grid;grid-template-columns:11ch 11ch;column-gap:1.5ch;justify-content:start;margin:0;line-height:1.3;max-width:100%;${opcoes.estilo || ''}"><span style="white-space:nowrap;overflow:visible;text-overflow:clip;">${rot('Volume:')} ${volumeTxt}</span><span style="white-space:nowrap;overflow:visible;text-overflow:clip;">${rot('Edição:')} ${edicaoTxt}</span></div>`;
    }
    return `<div class="book-meta-item book-meta-single book-volume-edicao" style="display:grid;grid-template-columns:11ch 11ch;column-gap:1.5ch;justify-content:start;margin:0;line-height:1.3;max-width:100%;"><span style="white-space:nowrap;overflow:visible;text-overflow:clip;"><strong>Volume:</strong> ${volumeTxt}</span><span style="white-space:nowrap;overflow:visible;text-overflow:clip;"><strong>Edição:</strong> ${edicaoTxt}</span></div>`;
}

/** Escapa texto antes de inseri-lo em HTML. */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// ============================================================================
// BANCO DE DADOS — SUPABASE
// ============================================================================

const _bibConfig = globalThis.BIBVANIA_CONFIG || {};
const supabaseUrl = _bibConfig.SUPABASE_URL || '';
// O frontend usa exclusivamente a chave pública publishable.
const supabaseKey = _bibConfig.SUPABASE_PUBLISHABLE_KEY || '';

// SEGURANÇA: versão fixa do supabase-js (nunca sem versão/"latest"); atualize de propósito
// e junto com o <script> UMD do admin.html.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.89.0/+esm";

// SESSÃO: o login do bibliotecário fica em localStorage e sobrevive ao fechamento da aba e do
// navegador. O logout ocorre após 8 dias sem nenhuma interação com o painel (ver
// INATIVIDADE_LIMITE_MS no admin.html) ou ao tocar em SAIR. Atenção: no GitHub Pages todos os
// sites de limaoruan.github.io compartilham a mesma origem; com localStorage, outro site
// publicado nela com falha de XSS poderia ler o token. Não publique outros sites nessa origem.
function _armazenamentoSessao() {
    try { return globalThis.localStorage || globalThis.sessionStorage || undefined; } catch (_) { return undefined; }
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { storage: _armazenamentoSessao(), persistSession: true, autoRefreshToken: true }
});

// ============================================================================
// CONSTANTES
// ----------------------------------------------------------------------------
// CATEGORIAS_FIXAS: lista canônica das 7 faixas etárias de referência
// indicativa aceitas pelo sistema, na ordem exibida em selects. Exportada
// como DB.CATEGORIAS.
// ============================================================================

const CATEGORIAS_FIXAS = [
    'LIVRE', '6 ANOS', '10 ANOS',
    '12 ANOS', '14 ANOS',
    '16 ANOS',
    '18 ANOS'
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
// exceto os campos em _CAMPOS_CASE_SENSITIVE.
// ============================================================================

const toUpper = (val) => (val && typeof val === 'string') ? val.toUpperCase().trim() : val;

const _CAMPOS_CASE_SENSITIVE = new Set(['imagem_url', 'verso_url', 'pdf_url', 'alt_text', 'foto_url']);

const padronizarObjeto = (obj) => {
    const novoObj = { ...obj };
    for (let key in novoObj) {
        if (typeof novoObj[key] === 'string' && !_CAMPOS_CASE_SENSITIVE.has(key)) {
            novoObj[key] = toUpper(novoObj[key]);
        }
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
//                   getEmprestimosAtivosComLivro, getEmprestimosAtivos,
//                   getStatusEmprestimosPublico
//   REALTIME      — onLivrosChange, onEmprestimosChange, onPessoasChange,
//                   onReservasChange
//   STORAGE       — (métodos de upload/remoção estão em admin.html via _iaUploadImgbb)
//   PESSOAS       — getPessoas, salvarPessoa, excluirPessoa, atualizarPessoa
// ============================================================================

const _realtimeEstado = {
    livros: { nome: 'livros-changes', tabela: 'livros', canal: null, callbacks: [] },
    emprestimos: { nome: 'emprestimos-changes', tabela: 'emprestimos', canal: null, callbacks: [] },
    pessoas: { nome: 'pessoas-changes', tabela: 'pessoas', canal: null, callbacks: [] },
    reservas: { nome: 'reservas-changes', tabela: 'reservas', canal: null, callbacks: [] }
};

function _inscreverRealtime(tipo, callback) {
    const estado = _realtimeEstado[tipo];
    if (!estado) return null;
    if (typeof callback === 'function' && !estado.callbacks.includes(callback)) {
        estado.callbacks.push(callback);
    }
    if (estado.canal) return estado.canal;
    estado.canal = supabase.channel(estado.nome)
        .on('postgres_changes', { event: '*', schema: 'public', table: estado.tabela }, payload => {
            estado.callbacks.slice().forEach(fn => {
                try { fn(payload); } catch (e) { console.warn('Callback Realtime falhou:', e); }
            });
        })
        .subscribe();
    return estado.canal;
}

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
        localStorage.removeItem('bibvania_admin_semnome');
        localStorage.removeItem('bibvania_ultima_atividade');
        // admin.html trata o login como overlay embutido na própria página;
        // quem chamar signOut() é responsável por mostrar esse overlay.
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
            return true; // Redirecionando — quem chamou não deve revelar a tela de login.
        }
        return false;
    },

    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange(callback);
    },

    // ── Livros ────────────────────────────────────────────────────────────────
    async getLivros() {
        try {
            const query = supabase
                .from("livros")
                .select("id, titulo, autor, isbn, categoria, volume, edicao, quantidade_total, quantidade_disponivel, alt_text, imagem_url, verso_url, pdf_url, data_cadastro, data_edicao")
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
     * Cadastra sempre um novo livro, com um novo ID disponível.
     * Não compara título, autor ou ISBN e não mescla registros existentes.
     * @param {Object} livro — objeto livro (campos em UPPER_SNAKE_CASE após padronização)
     * @returns {{ action: 'added', data: Object }}
     */
    async salvarLivro(livro) {
        try {
            livro = padronizarObjeto(livro);
            const novoId = await this.getProximoIdDisponivel();
            livro.id = novoId;
            livro.quantidade_disponivel = livro.quantidade_total;
            livro.data_cadastro = new Date().toISOString();
            const { data, error } = await supabase.from("livros").insert([livro]).select().single();
            if (error) throw error;
            return { action: "added", data };
        } catch (error) {
            console.error("Erro ao salvar livro:", error);
            throw error;
        }
    },

    /**
     * Atualiza os metadados de um livro existente.
     * O banco recalcula quantidade_disponivel com base nos empréstimos ativos
     * e nas reservas pendentes; não se deve sobrescrever esse valor no cliente.
     * imagem_url e pdf_url só são enviados no payload se explicitamente presentes no objeto.
     * @param {Object} livro — objeto livro com id obrigatório
     * @returns {Object} registro atualizado retornado pelo Supabase
     */
    async atualizarLivro(livro) {
        try {
            livro = padronizarObjeto(livro);
            const { count: emprestimosAtivos, error: countError } = await supabase
                .from("emprestimos").select("*", { count: 'exact', head: true })
                .eq("livro_id", livro.id).eq("status", "emprestado");
            if (countError) throw countError;
            const { count: reservasPendentes, error: reservasError } = await supabase
                .from("reservas").select("id", { count: 'exact', head: true })
                .eq("livro_id", livro.id).eq("status", "pendente");
            if (reservasError) throw reservasError;
            const ocupados = (emprestimosAtivos || 0) + (reservasPendentes || 0);
            const { data: livroAtual, error: livroAtualError } = await supabase
                .from("livros").select("quantidade_total").eq("id", livro.id).single();
            if (livroAtualError) throw livroAtualError;
            const totalNovo = Number(livro.quantidade_total ?? livroAtual.quantidade_total ?? 0);
            if (totalNovo !== Number(livroAtual.quantidade_total) && totalNovo < ocupados) {
                throw new Error(`A quantidade total não pode ficar abaixo dos ${ocupados} exemplares emprestados ou reservados.`);
            }
            const { imagem_url, verso_url, pdf_url, quantidade_disponivel: _estoqueCalculadoNoCliente, ...livroSemImagem } = livro;
            const updatePayload = { ...livroSemImagem, data_edicao: new Date().toISOString() };
            if (imagem_url !== undefined) updatePayload.imagem_url = imagem_url;
            if (verso_url  !== undefined) updatePayload.verso_url  = verso_url;
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

            const { data: reservasPendentes, error: reservaError } = await supabase
                .from("reservas").select("id").eq("livro_id", id).eq("status", "pendente").limit(1);
            if (reservaError) throw reservaError;
            if (reservasPendentes && reservasPendentes.length > 0) {
                throw new Error("IMPOSSÍVEL EXCLUIR: ESTE LIVRO POSSUI RESERVA PENDENTE. Cancele a reserva primeiro.");
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
            const { data: emprestimoAtual, error: consultaEmpError } = await supabase.from("emprestimos")
                .select("livro_id").eq("id", emprestimo.id).single();
            if (consultaEmpError) throw consultaEmpError;
            const livroAnteriorId = emprestimoAtual && emprestimoAtual.livro_id;
            const livroNovoId = emprestimo.livro_id !== undefined ? parseInt(emprestimo.livro_id) : livroAnteriorId;
            if (livroNovoId && livroNovoId !== livroAnteriorId) {
                const { data: livroNovo, error: livroNovoError } = await supabase.from("livros")
                    .select("quantidade_total,quantidade_disponivel").eq("id", livroNovoId).single();
                if (livroNovoError) throw livroNovoError;
                const { count: ativosNovo, error: ativosNovoError } = await supabase.from("emprestimos")
                    .select("id", { count: "exact", head: true }).eq("livro_id", livroNovoId).eq("status", "emprestado");
                if (ativosNovoError) throw ativosNovoError;
                const { count: reservasNovas, error: reservasNovasError } = await supabase.from("reservas")
                    .select("id", { count: "exact", head: true }).eq("livro_id", livroNovoId).eq("status", "pendente");
                if (reservasNovasError) throw reservasNovasError;
                if ((livroNovo.quantidade_total || 0) - (ativosNovo || 0) - (reservasNovas || 0) <= 0)
                    throw new Error("O NOVO LIVRO NÃO POSSUI EXEMPLARES DISPONÍVEIS ALÉM DAS RESERVAS PENDENTES");
                updateData.livro_id = livroNovoId;
            }
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

    async getHistoricoPessoa(pessoaId, nomePessoa) {
        try {
            // Busca por pessoa_id E por nome (para registros antigos sem pessoa_id)
            let query = supabase
                .from("emprestimos")
                .select("id, livro_id, status, data_emprestimo, data_devolucao, nome_aluno, livros(titulo, autor)")
                .order("data_emprestimo", { ascending: false });
            let data = [];
            if (pessoaId) {
                const principal = await query.eq("pessoa_id", pessoaId);
                if (principal.error) throw principal.error;
                data = principal.data || [];
                // Compatibilidade com empréstimos antigos criados antes de pessoa_id.
                if (nomePessoa) {
                    const antigos = await supabase
                        .from("emprestimos")
                        .select("id, livro_id, status, data_emprestimo, data_devolucao, nome_aluno, livros(titulo, autor)")
                        .is("pessoa_id", null)
                        .eq("nome_aluno", nomePessoa.toUpperCase())
                        .order("data_emprestimo", { ascending: false });
                    if (antigos.error) throw antigos.error;
                    data = data.concat(antigos.data || []);
                }
            } else if (nomePessoa) {
                const resultado = await query.eq("nome_aluno", nomePessoa.toUpperCase());
                if (resultado.error) throw resultado.error;
                data = resultado.data || [];
            }
            // Deduplicar por id (evita duplicatas caso nome_aluno e pessoa_id coincidam)
            const seen = new Set();
            return (data || []).filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
        } catch (error) {
            console.error("Erro ao buscar histórico:", error);
            return [];
        }
    },

    async getEmprestimosAtivosComLivro() {
        try {
            const { data, error } = await supabase
                .from("emprestimos")
                .select("*, livros(id,titulo,autor,isbn,categoria,volume,edicao,quantidade_total,quantidade_disponivel,imagem_url)")
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

    /**
     * getStatusEmprestimosPublico(): versão pública/anônima de getEmprestimosAtivos(),
     * usada pelo catálogo (index.html) para o destaque visual de "atrasado".
     * Lê a view emprestimos_status_publico (SQL) em vez da tabela emprestimos
     * diretamente — a view só expõe livro_id + atrasado, nunca nome_aluno,
     * sexo, ano_aluno ou turma_aluno (dados de aluno ficam só para o admin
     * autenticado, via getEmprestimosAtivos acima).
     */
    async getStatusEmprestimosPublico() {
        try {
            const { data, error } = await supabase
                .from("emprestimos_status_publico")
                .select("livro_id, atrasado");
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error("Erro ao buscar status público de empréstimos:", error);
            return [];
        }
    },

    // ── Realtime ──────────────────────────────────────────────────────────────
    onLivrosChange(callback) {
        return _inscreverRealtime('livros', callback);
    },

    onEmprestimosChange(callback) {
        return _inscreverRealtime('emprestimos', callback);
    },

    onPessoasChange(callback) {
        return _inscreverRealtime('pessoas', callback);
    },

    onReservasChange(callback) {
        return _inscreverRealtime('reservas', callback);
    },

    // ── Reservas ───────────────────────────────────────────────────────────────
    async buscarPessoasParaReserva(termo, tipos = ['aluno']) {
        const permitidos = ['aluno', 'funcionario', 'visitante'];
        const tiposBusca = Array.isArray(tipos) ? tipos.filter(tipo => permitidos.includes(tipo)) : [];
        const { data, error } = await supabase.rpc('bv_buscar_pessoas_reserva', {
            p_termo: termo,
            p_tipos: tiposBusca.length ? tiposBusca : ['aluno']
        });
        if (error) throw error;
        return data || [];
    },

    async criarReservaPublica(livroId, pessoaId, trocar = false) {
        const { data, error } = await supabase.rpc('bv_criar_reserva', {
            p_livro_id: Number(livroId),
            p_pessoa_id: Number(pessoaId),
            p_trocar: Boolean(trocar)
        });
        if (error) throw error;
        return data;
    },

    async getReservasPendentes() {
        const query = supabase.from('reservas')
            .select('id,livro_id,pessoa_id,nome_pessoa,sexo,ano_aluno,turma_aluno,tipo,data_reserva,status')
            .eq('status', 'pendente')
            .order('data_reserva', { ascending: true })
            .order('id', { ascending: true });
        const reservas = await this._fetchAll(query);
        const livroIds = [...new Set(reservas.map(r => r.livro_id).filter(Boolean))];
        const pessoaIds = [...new Set(reservas.map(r => r.pessoa_id).filter(Boolean))];
        const [livrosResult, pessoasResult] = await Promise.all([
            livroIds.length
                ? supabase.from('livros')
                    .select('id,isbn,imagem_url,pdf_url,verso_url,titulo,autor,categoria,volume,edicao,alt_text,quantidade_total,quantidade_disponivel,data_cadastro,data_edicao')
                    .in('id', livroIds)
                : Promise.resolve({ data: [], error: null }),
            pessoaIds.length
                ? supabase.from('pessoas')
                    .select('id,nome,sexo,tipo,ano_aluno,turma_aluno,pcd,data_cadastro')
                    .in('id', pessoaIds)
                : Promise.resolve({ data: [], error: null })
        ]);
        if (livrosResult.error) throw livrosResult.error;
        if (pessoasResult.error) throw pessoasResult.error;
        const livrosPorId = new Map((livrosResult.data || []).map(l => [String(l.id), l]));
        const pessoasPorId = new Map((pessoasResult.data || []).map(p => [String(p.id), p]));
        return reservas.map(r => ({
            ...r,
            livro: livrosPorId.get(String(r.livro_id)) || null,
            pessoa: pessoasPorId.get(String(r.pessoa_id)) || null
        }));
    },

    async getReservas() {
        const query = supabase.from('reservas')
            .select('id,status,data_reserva,livro_id,tipo,ano_aluno,turma_aluno')
            .order('data_reserva', { ascending: false })
            .order('id', { ascending: false });
        return await this._fetchAll(query);
    },

    async cancelarReserva(reservaId) {
        const { data, error } = await supabase.from('reservas')
            .update({ status: 'cancelada' })
            .eq('id', reservaId)
            .eq('status', 'pendente')
            .select('id')
            .single();
        if (error) throw error;
        return data;
    },

    async concluirReserva(reservaId, dataEmprestimo, dias, semData = false) {
        const { data, error } = await supabase.rpc('bv_concluir_reserva', {
            p_reserva_id: Number(reservaId),
            p_data_emprestimo: dataEmprestimo,
            p_dias: Number(dias),
            p_sem_data: Boolean(semData)
        });
        if (error) throw error;
        return data;
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
        await supabase.from('emprestimos').delete().eq('pessoa_id', id);
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
