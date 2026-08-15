# Plano de Implementação: Visualização de Agenda (Calendário)

Adicionar uma visualização de agenda/calendário para que as moradoras possam ver não apenas o próximo responsável, mas a escala completa projetada para as próximas semanas.

## Alterações Propostas

### Interface (Frontend)
- **Novo componente de Agenda:** Criar uma seção "Agenda de Limpezas" que projeta as próximas datas de limpeza (Segundas e Quintas).
- **Cálculo de Escala Futura:** Implementar lógica para projetar os próximos 6 responsáveis baseados no histórico.
- **Visualização:** Lista cronológica com ícones de calendário para facilitar a leitura.

### Detalhes Técnicos
- Utilizar `date-fns` para manipulação de datas.
- Manter o ciclo de quartos (6, 7, 8, 9, 10).
- Local: `src/routes/index.tsx`.
