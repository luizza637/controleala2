# Plano - Correção da Escala e Restrição de Marcação

O usuário relatou que a ordem dos quartos na escala está incorreta e solicitou que apenas o quarto responsável pelo dia consiga marcar a limpeza como concluída.

## Mudanças Propostas

### 1. Correção da Lógica de Escala (Rotação)
A escala segue a ordem: 6 -> 7 -> 8 -> 9 -> 10 -> 6...
- Ajustar a lógica para identificar o responsável da vez com base no histórico de limpezas concluídas.
- O responsável ATUAL de um dia de limpeza deve ser o sucessor direto do último quarto que limpou (ciclo 6-10).

### 2. Restrição de Marcação por Quarto
- O botão "Marcar como Finalizado" será habilitado **apenas** para o quarto que é o responsável da vez.
- Se o usuário selecionou o Quarto 8, mas o responsável do dia é o Quarto 9, o botão exibirá uma mensagem informando que apenas o Quarto 9 pode marcar.

### 3. Melhoria na Agenda (Próximas Limpezas)
- Garantir que a projeção da agenda use as datas corretas (Segundas e Quintas).
- Alinhar a rotação dos quartos na agenda com a realidade do último log inserido.

## Detalhes Técnicos
- **`getResponsibleRoom`**: Será a fonte da verdade. Ela pegará o `room_number` do log mais recente e retornará o próximo na sequência `((lastRoom - 6 + 1) % 5) + 6`.
- **Validação no Componente**: 
  ```tsx
  const isMyTurn = myRoom === responsibleRoom;
  const canFinish = isCleaningDay && !isCompleted && !isPaused && isMyTurn;
  ```
- **Feedback Visual**: Se `isCleaningDay && !isCompleted && !isMyTurn`, mostrar um aviso: "Aguardando o Quarto X realizar a limpeza".
