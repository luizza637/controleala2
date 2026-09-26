import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Clock, RotateCcw, History, LayoutDashboard, Calendar, Pause, Play, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, isSameDay, isAfter, isBefore, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/")({ component: Index, head: () => ({ meta: [{ title: "Ala 2 Control — Escala de Limpeza dos Quartos 6 a 10" }, { name: "description", content: "Veja quem é o quarto responsável pela limpeza da Ala 2, marque como concluída e acompanhe o histórico e as próximas datas em tempo real." }, { property: "og:title", content: "Ala 2 Control — Escala de Limpeza" }, { property: "og:description", content: "Escala de limpeza da Ala 2 em tempo real: responsável da vez, status, próximas datas e histórico dos quartos 6 a 10." }, { property: "og:url", content: "https://controleala2.lovable.app/" }, { property: "og:type", content: "website" }], links: [{ rel: "canonical", href: "https://controleala2.lovable.app/" }] }) });

const ROOMS = [10, 9, 7, 6, 8];
const CLEANING_DAYS = [1, 4];

function Index() {
  const [myRoom, setMyRoom] = useState<number | null>(null);
  const [isChangingRoom, setIsChangingRoom] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => { const savedRoom = localStorage.getItem("user_room"); if (savedRoom) setMyRoom(parseInt(savedRoom, 10)); }, []);
  const handleSelectRoom = (room: number) => { setMyRoom(room); localStorage.setItem("user_room", room.toString()); setIsChangingRoom(false); toast.success(`Quarto ${room} selecionado!`); };

  useEffect(() => {
    const channel = supabase.channel("app_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaning_logs" }, () => queryClient.invalidateQueries({ queryKey: ["cleaning_logs"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => queryClient.invalidateQueries({ queryKey: ["app_settings"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: logs, isLoading, isError: logsError, error: logsQueryError } = useQuery({
    queryKey: ["cleaning_logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cleaning_logs").select("*").order("completed_at", { ascending: false }).limit(15);
      if (error) throw error;
      return data ?? [];
    },
    retry: 2,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: appSettings } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings" as any).select("*").in("key", ["is_paused", "room_order"]);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return { isPaused: rows.find((r) => r.key === "is_paused")?.value === true, roomOrder: (rows.find((r) => r.key === "room_order")?.value as number[]) ?? ROOMS };
    },
  });

  const isPaused = appSettings?.isPaused === true;
  // Ordem oficial: 10 → 9 → 7 → 6 → 8 → 10...
  const roomOrder: number[] = ROOMS;

  const togglePause = useMutation({ mutationFn: async () => { const { error } = await supabase.from("app_settings" as any).upsert({ key: "is_paused", value: !isPaused } as any); if (error) throw error; }, onSuccess: () => { toast.success(isPaused ? "Aplicativo retomado!" : "Aplicativo pausado para férias!"); queryClient.invalidateQueries({ queryKey: ["app_settings"] }); }, onError: (error) => toast.error("Erro ao alterar status: " + error.message) });
  const swapTurns = useMutation({ mutationFn: async (pair: { current: number; next: number }) => { const newOrder = roomOrder.map((r) => r === pair.current ? pair.next : r === pair.next ? pair.current : r); const { error } = await supabase.from("app_settings" as any).upsert({ key: "room_order", value: newOrder } as any); if (error) throw error; return pair; }, onSuccess: (pair) => { toast.success(`Vez trocada: Quarto ${pair.next} limpa agora e o Quarto ${pair.current} assume a próxima.`); queryClient.invalidateQueries({ queryKey: ["app_settings"] }); }, onError: (error) => toast.error("Erro ao trocar a vez: " + error.message) });

  const nextInConfiguredOrder = (room: number, order: number[]) => {
    const idx = order.indexOf(room);
    if (idx === -1) return order[0]!;
    return order[(idx + 1) % order.length]!;
  };

  const finishCleaning = useMutation({
    mutationFn: async () => {
      if (!myRoom) throw new Error("Quarto não selecionado");

      // O registro pode ser feito assim que o quarto realmente terminar a limpeza.
      // Não dependemos do dia previsto no calendário.
      const { data, error } = await supabase
        .from("cleaning_logs")
        .insert({ room_number: myRoom, status: "concluido" })
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (savedLog) => {
      const currentLogs = queryClient.getQueryData<any[]>(["cleaning_logs"]) ?? [];
      const updatedLogs = [
        savedLog,
        ...currentLogs.filter((log) => log.id !== savedLog.id),
      ]
        .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
        .slice(0, 15);

      queryClient.setQueryData(["cleaning_logs"], updatedLogs);
      await queryClient.refetchQueries({ queryKey: ["cleaning_logs"], type: "active" });

      const nextRoom = nextInConfiguredOrder(savedLog.room_number, roomOrder);
      toast.success(`Limpeza do Quarto ${savedLog.room_number} registrada. Próximo: Quarto ${nextRoom}.`);
    },
    onError: (error) => toast.error("Erro ao finalizar limpeza: " + error.message),
  });

  if (!myRoom || isChangingRoom) return <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6"><h1 className="text-3xl font-bold text-slate-900 mb-2">Selecione seu Quarto — Ala 2 Control</h1><p className="text-slate-600 mb-8 text-center">Para começar, selecione o seu quarto da Ala 2:</p><div className="grid grid-cols-2 gap-4 w-full max-w-xs">{ROOMS.map((room) => <Button key={room} variant="outline" className="h-20 text-xl font-bold" onClick={() => handleSelectRoom(room)}>Quarto {room}</Button>)}</div></div>;

  const now = new Date();
  const todayDay = now.getDay();
  const getMostRecentCleaningDay = () => { let d = new Date(now); d.setHours(0, 0, 0, 0); while (!CLEANING_DAYS.includes(d.getDay())) d = subDays(d, 1); return d; };
  const scheduledDay = getMostRecentCleaningDay();
  const isCleaningDay = CLEANING_DAYS.includes(todayDay);
  const lastCleaning = logs?.[0];
  const lastCleaningDate = lastCleaning ? new Date(lastCleaning.completed_at) : null;
  const isCompleted = !!lastCleaningDate && (isSameDay(lastCleaningDate, now) || (isAfter(lastCleaningDate, scheduledDay) && !isBefore(lastCleaningDate, scheduledDay)));
  const nextInOrder = (room: number) => nextInConfiguredOrder(room, roomOrder);
  const responsibleRoom = lastCleaning ? nextInOrder(lastCleaning.room_number) : roomOrder[0]!;
  const upcomingRoom = nextInOrder(responsibleRoom);
  const isMyTurn = myRoom === responsibleRoom;
  const status = isPaused ? { label: "Em Férias", color: "bg-slate-500", icon: <Pause className="w-6 h-6" /> } : isCompleted ? { label: "Concluído", color: "bg-green-500", icon: <CheckCircle2 className="w-6 h-6" /> } : isCleaningDay ? { label: "No Prazo", color: "bg-yellow-500", icon: <Clock className="w-6 h-6" /> } : { label: "Atrasado", color: "bg-red-500", icon: <AlertCircle className="w-6 h-6" /> };

  const getFutureSchedule = () => {
    const schedule: { date: Date; room: number }[] = [];
    let nextRoom = lastCleaning ? nextInOrder(lastCleaning.room_number) : responsibleRoom;
    let checkDate = lastCleaning ? new Date(lastCleaning.completed_at) : new Date(now);
    checkDate.setHours(0, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      do { checkDate = addDays(checkDate, 1); } while (!CLEANING_DAYS.includes(checkDate.getDay()));
      schedule.push({ date: new Date(checkDate), room: nextRoom });
      nextRoom = nextInOrder(nextRoom);
    }
    return schedule;
  };
  const futureSchedule = getFutureSchedule();

  return <div className="min-h-screen bg-slate-50 pb-10 font-sans">
    <header className="bg-white border-b px-6 py-4 sticky top-0 z-10 flex justify-between items-center shadow-sm"><div className="flex items-center gap-2"><div className="bg-primary p-2 rounded-lg text-white"><LayoutDashboard className="w-5 h-5" /></div><h1 className="text-base font-bold text-slate-900">Ala 2 Control<span className="block text-[11px] font-medium text-slate-500">Escala de Limpeza</span></h1></div><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => togglePause.mutate()}>{isPaused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}{isPaused ? "Retomar" : "Férias"}</Button><Button variant="ghost" size="sm" onClick={() => setIsChangingRoom(true)}><RotateCcw className="w-4 h-4 mr-2" />Q. {myRoom}</Button></div></header>

    <main className="max-w-md mx-auto p-4 space-y-6">
      <Card className={`text-white border-none shadow-lg ${status.color}`}><CardHeader className="pb-2"><div className="flex justify-between items-center"><CardDescription className="text-white/80">Status do Banheiro</CardDescription>{status.icon}</div><CardTitle className="text-4xl font-black">{status.label}</CardTitle></CardHeader><CardContent><p className="text-white/90 text-sm font-medium">{isPaused ? "O aplicativo está pausado para as férias. A escala voltará ao normal assim que retomado." : isCompleted ? `Limpo por último pelo Quarto ${lastCleaning?.room_number}` : isCleaningDay ? "Hoje é dia de limpeza! Aguardando conclusão." : "A última limpeza ainda não foi realizada ou está pendente."}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Responsável da Vez</CardTitle><CardDescription>Escala de revezamento</CardDescription></CardHeader><CardContent className="flex flex-col items-center py-6"><div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-4"><span className="text-4xl font-bold text-primary">{responsibleRoom}</span></div><p className="text-slate-600 text-center font-medium">Quarto {responsibleRoom} deve realizar a limpeza {isCleaningDay ? "hoje" : "quando realizar a próxima limpeza"}.</p>{!isPaused && <div className="w-full space-y-3 mt-6">{!isMyTurn && <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-xs text-center">Apenas o Quarto {responsibleRoom} pode marcar esta limpeza como concluída.</div>}<Button className="w-full h-14 text-lg font-bold" onClick={() => finishCleaning.mutate()} disabled={finishCleaning.isPending || !isMyTurn}>{finishCleaning.isPending ? "Salvando..." : "Marcar limpeza como concluída"}</Button><Button variant="outline" className="w-full h-12 font-semibold" onClick={() => swapTurns.mutate({ current: responsibleRoom, next: upcomingRoom })} disabled={swapTurns.isPending}><ArrowLeftRight className="w-4 h-4 mr-2" />{swapTurns.isPending ? "Trocando..." : `Trocar vez com o Quarto ${upcomingRoom}`}</Button></div>}</CardContent></Card>
      <Card><CardHeader><div className="flex items-center gap-2"><Calendar className="w-5 h-5" /><CardTitle>Próximas Limpezas</CardTitle></div></CardHeader><CardContent className="space-y-2">{futureSchedule.map((item, index) => <div key={`${item.date.toISOString()}-${item.room}-${index}`} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center"><div><p className="font-bold text-slate-800">Quarto {item.room}</p><p className="text-xs text-slate-500">{format(item.date, "eeee, d 'de' MMMM", { locale: ptBR })}</p></div><Calendar className="w-5 h-5 text-primary" /></div>)}</CardContent></Card>
      <div><div className="flex items-center gap-2 text-slate-800 px-1 mb-3"><History className="w-5 h-5" /><h2 className="font-bold">Histórico Recente</h2></div>{logsError ? <div className="text-center py-6 text-red-500 bg-white rounded-xl border border-red-100 text-sm">Não foi possível carregar o histórico. {logsQueryError instanceof Error ? logsQueryError.message : "Verifique a conexão com o Supabase."}</div> : isLoading ? <div className="text-center py-8 text-slate-400">Carregando histórico...</div> : !logs || logs.length === 0 ? <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-dashed">Nenhuma limpeza registrada ainda.</div> : <div className="space-y-2">{logs.map((log) => <div key={log.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center"><div><p className="font-bold text-slate-800">Quarto {log.room_number}</p><p className="text-xs text-slate-500">{format(new Date(log.completed_at), "eeee, d 'de' MMMM", { locale: ptBR })}</p></div><div className="text-right"><p className="text-xs font-bold text-slate-400 uppercase">Horário</p><p className="text-sm font-mono font-bold text-primary">{format(new Date(log.completed_at), "HH:mm")}</p></div></div>)}</div>}</div>

      <footer className="pt-6 pb-2 text-center"><span className="text-xs text-slate-400">Desenvolvido por ALDev</span></footer>
    </main>
  </div>;
}
