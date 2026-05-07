# GELADEIROTECA ONLINE v1.4

**BIBLIOTECA MÓVEL DO(A) EMTI**
PROFESSORA MARIA VÂNIA FARIAS LINHARES

> 🌐 **[Acessar o acervo público](https://emtivania.github.io/geladeiroteca/)** · Desenvolvido por [EMTI MARIA VANIA](https://github.com/emtivania) · Licença [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pt-br)

---

## Sobre

GELADEIROTECA ONLINE é um sistema web de gerenciamento de biblioteca baseado no BibVania.
Permite consulta pública do acervo, painel administrativo, controle de empréstimos e cadastro de livros com inteligência artificial.
Roda 100% no navegador, sem servidor próprio.

---

## Tecnologias

- **Frontend:** HTML5, CSS3, JavaScript vanilla (sem frameworks, sem build tools)
- **Banco de dados / Auth / Realtime:** [Supabase](https://supabase.com) (PostgreSQL)
- **IA — metadados:** Google Books API (sem chave, uso público)
- **Upload de capas:** [ImgBB](https://imgbb.com) (chave gratuita)
- **Hospedagem sugerida:** GitHub Pages

---

## Funcionalidades

### Acervo público (`index.html`)
- Busca por título, ISBN, autor, editora, sinopse e palavras-chave
- Tags de palavras-chave clicáveis
- Capas dos livros com lightbox
- Indicação visual de disponibilidade em tempo real
- Acessibilidade: busca por voz, modo escuro, VLibras

### Painel administrativo (`admin.html`)
- Cadastro, edição e exclusão de livros com upload de capa via ImgBB
- Controle de empréstimos: registrar, editar, renovar, devolver, excluir
- Cadastro de alunos e funcionários
- Realtime: atualiza automaticamente sem recarregar
- Cadastro rápido com IA integrado

### Login (`login.html`)
- Autenticação por e-mail e senha via Supabase Auth

---

## Estrutura de arquivos

```
GELADEIROTECA ONLINE/
├── index.html               — Acervo público
├── admin.html               — Painel do bibliotecário
├── login.html               — Autenticação
├── bibmaker.html            — Criador de bibliotecas (BibMaker)
├── bibvania.js              — Banco de dados, utilitários e transições
├── style.css                — Estilos globais
├── logo.png                 — Logo do sistema
├── favicon.png              — Favicon
├── og-image.png             — Imagem Open Graph
├── supabase_setup.sql       — Configuração inicial do banco
├── setup_private.sql        — Chaves de API (ImgBB e Groq) — NÃO subir ao GitHub
└── README.md                — Este arquivo
```

---

## Configuração inicial

### 1. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita
2. Clique em **New Project**, escolha um nome e senha forte
3. Aguarde o projeto ser criado

### 2. Executar o SQL de configuração

1. No menu lateral, vá em **SQL Editor → New query**
2. Cole o conteúdo de `supabase_setup.sql` e clique em **Run**

### 3. Inserir as chaves de API privadas

1. Abra `setup_private.sql`, substitua os valores marcados com `<<SUA_CHAVE_AQUI>>`
2. Execute no **SQL Editor** do Supabase

### 4. Inserir as credenciais no código

Abra `bibvania.js` e substitua:

```js
const supabaseUrl = "https://zkscdfqsqhxldxlmklum.supabase.co";
const supabaseKey = "SUA_CHAVE_ANON_PUBLIC";
```

### 5. Criar o usuário bibliotecário

1. No Supabase, vá em **Authentication → Users**
2. Clique em **Add user** e informe e-mail e senha

### 6. Publicar no GitHub Pages

1. Suba todos os arquivos em um repositório público
2. Vá em **Settings → Pages → Source → Deploy from a branch**
3. Escolha o branch `main` e pasta `/ (root)` → **Save**

> ⚠️ Não suba o `setup_private.sql` com as chaves reais para o GitHub.

---

## Licença

CC-BY 4.0

Compartilhar — copiar e redistribuir o material em qualquer suporte ou formato para qualquer fim, mesmo que comercial.
Adaptar — remixar, transformar, e criar a partir do material para qualquer fim, mesmo que comercial.
O licenciante não pode revogar estes direitos desde que você respeite os termos da licença.

---

## Derivado de

> **BibVania v1.7** por [Ruan Oliveira Lima](https://github.com/emtivania/bibvania)
> Repositório: https://github.com/emtivania/bibvania · Ano: 2026 · Licença: CC-BY-4.0
>
> Este projeto foi criado com o BibMaker, o criador de bibliotecas da BibVania.
