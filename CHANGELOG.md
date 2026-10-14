# CHANGELOG — Geladeiroteca Online

Histórico de mudanças, remoções e adições do projeto Geladeiroteca Online.

## Formatação

Cada entrada segue esta estrutura fixa:

```
#ID Data e Hora
[Remoção/Adição] no(a) [ONDE]
Descrição: Descrição detalhada da mudança.
```

- **ID**: número inteiro precedido de `#` (ex.: `#1`). O próximo ID é sempre o seguinte ao maior ID já usado (nunca reutilizar ou pular números).
- **Ordem**: crescente na numeração, mas decrescente na posição do arquivo — cada nova entrada é adicionada **acima** da anterior, ou seja, o ID mais alto fica sempre no topo do documento e o `#1` permanece no final.
- **Data e Hora**: data no formato `DD/MM/AAAA` e hora no formato `HH:MM:ss`, no momento em que a mudança foi feita.
- **[Remoção/Adição]**: indicar se a mudança foi uma remoção ou uma adição. Para casos que não são estritamente um dos dois (uma correção de bug, uma decisão, uma mudança de comportamento), usar o termo que mais se aproxima (ex.: "Correção", "Mudança") mantendo a mesma estrutura de linha.
- **[ONDE]**: o local da mudança — pode ser um arquivo específico (ex.: `admin.html`), o banco de dados/Supabase, um prompt de IA, ou um site/serviço externo.
- **Descrição**: detalhada o suficiente para servir a três propósitos ao mesmo tempo: (1) funcionar como backup/registro da própria mudança para a pessoa responsável pelo BibVania (ou uma IA como o Claude, atuando por ela), permitindo reconstruí-la se necessário; (2) permitir que a pessoa responsável por uma biblioteca derivada (ou uma IA como o Claude, atuando por ela) aplique a mudança no próprio projeto; e (3) trazer uma explicação em linguagem simples, fácil de entender para quem lê — seja um(a) desenvolvedor(a), bibliotecário(a) ou qualquer outro leitor —, do que realmente mudou na prática.

---

#1 14/10/2026 10:54:00
Adição no arquivo `VERSION.json`
Descrição: Versão do projeto definida como 1.6. Em termos simples: a biblioteca foi criada na versão 1.6.
