# Central O&M — frontend (GitHub Pages)

- Antes de mexer em qualquer gerador de texto ou relatório, leia `docs/PADRAO_COMUNICACAO_RELATORIOS_GRID.md`: é a fonte de verdade do padrão de comunicação da Grid Co. e tem prioridade sobre suposições.
- Central de Mensagens: `comunicacao/` (formatWhatsApp, roteamento, validators, ui). Testes: `npm test` (Node, sem dependências).
- Usinas, clientes e técnicos vêm só do mapeamento oficial (`GET /mapeamento-ufvs`). Não inventar contatos, usinas ou técnicos.
- Chaves de API e secrets ficam no backend (VM1, `.env`), nunca neste repositório.
- Boletins de Medição: `bm/bm.js`. Ao alterar, suba o `?v=` das tags `<script src="bm/...">` no fim do `index.html` (senão o navegador segue com a versão antiga em cache).
