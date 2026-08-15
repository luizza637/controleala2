# Plano de Implementação: App de Controle de Limpeza (Ala 2)

Sistema Mobile First para gestão em tempo real das limpezas da Ala 2 (Quartos 6 a 10), com sincronização em nuvem e histórico.

## 1. Banco de Dados (Lovable Cloud)

Criar a estrutura necessária para persistência dos dados e sincronização em tempo real.

- **Tabela `cleaning_logs`**:
  - `id` (uuid, primary key)
  - `room_number` (int: 6, 7, 8, 9, 10)
  - `completed_at` (timestamp with time zone)
  - `status` (text: 'concluido')
- **Tabela `cleaning_schedule`** (Opcional, ou lógica em código):
  - Ordem fixa de revezamento: 6 -> 7 -> 8 -> 9 -> 10 -> 6...
  - Dias: Segundas e Quintas.

## 2. Interface e Funcionalidades

### Escolha de Quarto (Onboarding)
- Na primeira visita, o usuário escolhe seu quarto.
- Armazenado no `localStorage` para persistência local.
- Botão "Alterar Quarto" disponível no dashboard.

### Dashboard Principal
- **Status da Limpeza**: Cartão colorido no topo.
  - Verde: Limpeza concluída hoje (ou na data programada mais recente).
  - Amarelo: Dia de limpeza, mas ainda pendente.
  - Vermelho: Atrasado (passou da data sem registro).
- **Responsável da Vez**: Identifica qual quarto deve limpar com base na última limpeza realizada.

### Ações
- **Botão "Marcar como Concluído"**: Salva a limpeza atual no banco de dados com timestamp e o quarto do usuário.
- **Feedback Visual**: Confirmação imediata e atualização do status para todos os usuários via Realtime.

### Histórico e Escala
- Lista cronológica das últimas 10 limpezas.
- Visualização da escala (próximos quartos).

## 3. Detalhes Técnicos

- **Tecnologia**: React, Tailwind CSS, TanStack Query (para fetch e sincronização), Supabase (Lovable Cloud) para Realtime.
- **Lógica de Status**: Cálculo comparando a data atual com as segundas/quintas e o último registro na tabela `cleaning_logs`.
- **Estilo**: Mobile First, usando componentes do `shadcn/ui` para botões, cartões e diálogos.

## 4. Segurança
- RLS habilitado na tabela `cleaning_logs` permitindo `INSERT` e `SELECT` para usuários anônimos (conforme solicitado: sem login).

---

Este plano foca na simplicidade de uso e na visibilidade imediata do status da limpeza para as moradoras.