import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Clock, RotateCcw, History, LayoutDashboard, Calendar, Pause, Play, ArrowLeftRight, Lock, LogOut, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format, addDays, isSameDay, isAfter, isBefore, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/")({ component: Index, head: () => ({ meta: [{ title: "Ala 2 Control — Escala de Limpeza dos Quartos 6 a 10" }, { name: "description", content: "Veja quem é o quarto responsável pela limpeza da Ala 2, marque como concluída e acompanhe o histórico e as próximas datas em tempo real." }, { property: "og:title", content: "Ala 2 Control — Escala de Limpeza" }, { property: "og:description", content: "Escala de limpeza da Ala 2 em tempo real: responsável da vez, status, próximas datas e histórico dos quartos 6 a 10." }, { property: "og:url", content: "https://controleala2.lovable.app/" }, { property: "og:type", content: "website" }], links: [{ rel: "canonical", href: "https://controleala2.lovable.app/" }] }) });

const ROOMS = [6, 7, 8, 9, 10];
const CLEANING_DAYS = [1, 4];
const ADMIN_PASSWORD = "ala2@moradia";

function Index() {
  const [myRoom, setMyRoom] = useState<number | null>(null);
  const [isChangingRoom, setIsChangingRoom] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRoom, setAdminRoom] = useState(6);
  const [adminDate, setAdminDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [adminSavedMessage, setAdminSavedMessage] = useState<string | null>(null);
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
  const roomOrder: number[] = appSettings?.roomOrder?.length === 5 ? appSettings.roomOrder : ROOMS;

  const togglePause = useMutation({ mutationFn: async () => { const { error } = await supabase.from("app_settings" as any).upsert({ key: "is_paused", value: !isPaused } as any); if (error) throw error; }, onSuccess: () => { toast.success(isPaused ? "Aplicativo retomado!" : "Aplicativo pausado para férias!"); queryClient.invalidateQueries({ queryKey: ["app_settings"] }); }, onError: (error) => toast.error("Erro ao alterar status: " + error.message) });
  const swapTurns = useMutation({ mutationFn: async (pair: { current: number; next: number }) => { const newOrder = roomOrder.map((r) => r === pair.current ? pair.next : r === pair.next ? pair.current : r); const { error } = await supabase.from("app_settings" as any).upsert({ key: "room_order", value: newOrder } as any); if (error) throw error; return pair; }, onSuccess: (pair) => { toast.success(`Vez trocada: Quarto ${pair.next} limpa agora e o Quarto ${pair.current} assume a próxima.`); queryClient.invalidateQueries({ queryKey: ["app_settings"] }); }, onError: (error) => toast.error("Erro ao trocar a vez: " + error.message) });
  const finishCleaning = useMutation({ mutationFn: async () => { if (!myRoom) throw new Error("Quarto não selecionado"); const { error } = await supabase.from("cleaning_logs").insert({ room_number: myRoom }); if (error) throw error; }, onSuccess: () => { toast.success("Limpeza finalizada com sucesso!"); queryClient.invalidateQueries({ queryKey: ["cleaning_logs"] }); }, onError: (error) => toast.error("Erro ao finalizar limpeza: " + error.message) });

  const authenticateAdmin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setAdminAuthenticated(true);
      setAdminPassword("");
      toast.success("Painel administrativo liberado.");
    } else {
      toast.error("Senha incorreta.");
      setAdminPassword("");
    }
  };

  const adminAddCleaning = useMutation({
    mutationFn: async () => {
      if (!adminAuthenticated) throw new Error("Acesso administrativo não autorizado.");
      if (!adminDate) throw new Error("Selecione a data da limpeza.");
      const selectedDate = new Date(`${adminDate}T12:00:00`);
      if (Number.isNaN(selectedDate.getTime())) throw new Error("Data inválida.");
      const completedAt = selectedDate.toISOString();
      const { data, error } = await supabase.from("cleaning_logs").insert({ room_number: adminRoom, completed_at: completedAt, status: "concluido" }).select("id, room_number, completed_at").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (savedLog) => {
      const nextRoom = roomOrder[(roomOrder.indexOf(adminRoom) + 1 + roomOrder.length) % roomOrder.length] ?? ROOMS[0];
      const dateLabel = format(new Date(`${adminDate}T12:00:00`), "dd/MM/yyyy");
      const message = `Quarto ${adminRoom} registrado em ${dateLabel}. Próximo da vez: Quarto ${nextRoom}.`;
      setAdminSavedMessage(message);
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ["cleaning_logs"] });
    },
    onError: (error) => toast.error("Erro ao registrar limpeza: " + error.message),
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
  const nextInOrder = (room: number) => { const idx = roomOrder.indexOf(room); if (idx === -1) return roomOrder[0]!; return roomOrder[(idx + 1) % roomOrder.length]!; };
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
      <Card><CardHeader><CardTitle>Responsável da Vez</CardTitle><CardDescription>Escala de revezamento (6-10)</CardDescription></CardHeader><CardContent className="flex flex-col items-center py-6"><div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-4"><span className="text-4xl font-bold text-primary">{responsibleRoom}</span></div><p className="text-slate-600 text-center font-medium">Quarto {responsibleRoom} deve realizar a limpeza {isCleaningDay ? "hoje" : "na próxima data"}.</p>{!isCompleted && !isPaused && <div className="w-full space-y-3 mt-6">{!isMyTurn && <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-xs text-center">Apenas o Quarto {responsibleRoom} pode marcar esta limpeza como concluída.</div>}<Button className="w-full h-14 text-lg font-bold" onClick={() => finishCleaning.mutate()} disabled={finishCleaning.isPending || !isMyTurn}>{finishCleaning.isPending ? "Salvando..." : "Marcar como Finalizado"}</Button><Button variant="outline" className="w-full h-12 font-semibold" onClick={() => swapTurns.mutate({ current: responsibleRoom, next: upcomingRoom })} disabled={swapTurns.isPending}><ArrowLeftRight className="w-4 h-4 mr-2" />{swapTurns.isPending ? "Trocando..." : `Trocar vez com o Quarto ${upcomingRoom}`}</Button></div>}</CardContent></Card>
      <Card><CardHeader><div className="flex items-center gap-2"><Calendar className="w-5 h-5" /><CardTitle>Próximas Limpezas</CardTitle></div></CardHeader><CardContent className="space-y-2">{futureSchedule.map((item, index) => <div key={`${item.date.toISOString()}-${item.room}-${index}`} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center"><div><p className="font-bold text-slate-800">Quarto {item.room}</p><p className="text-xs text-slate-500">{format(item.date, "eeee, d 'de' MMMM", { locale: ptBR })}</p></div><Calendar className="w-5 h-5 text-primary" /></div>)}</CardContent></Card>
      <div><div className="flex items-center gap-2 text-slate-800 px-1 mb-3"><History className="w-5 h-5" /><h2 className="font-bold">Histórico Recente</h2></div>{logsError ? <div className="text-center py-6 text-red-500 bg-white rounded-xl border border-red-100 text-sm">Não foi possível carregar o histórico. {logsQueryError instanceof Error ? logsQueryError.message : "Verifique a conexão com o Supabase."}</div> : isLoading ? <div className="text-center py-8 text-slate-400">Carregando histórico...</div> : logs?.length === 0 ? <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-dashed">Nenhuma limpeza registrada ainda.</div> : <div className="space-y-2">{logs.map((log) => <div key={log.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center"><div><p className="font-bold text-slate-800">Quarto {log.room_number}</p><p className="text-xs text-slate-500">{format(new Date(log.completed_at), "eeee, d 'de' MMMM", { locale: ptBR })}</p></div><div className="text-right"><p className="text-xs font-bold text-slate-400 uppercase">Horário</p><p className="text-sm font-mono font-bold text-primary">{format(new Date(log.completed_at), "HH:mm")}</p></div></div>)}</div>}</div>

      <footer className="pt-6 pb-2 text-center"><button type="button" className="text-xs text-slate-400 hover:text-slate-600 transition-colors" onClick={() => setAdminOpen(true)}>Desenvolvido por ALDev</button></footer>
    </main>

    {adminOpen && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) { setAdminOpen(false); setAdminAuthenticated(false); } }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        {!adminAuthenticated ? <>
          <div className="flex items-center gap-3 mb-2"><div className="p-2 rounded-lg bg-slate-100"><Lock className="w-5 h-5 text-slate-700" /></div><div><h2 className="text-xl font-bold text-slate-900">Área administrativa</h2><p className="text-sm text-slate-500">Acesso restrito.</p></div></div>
          <div className="space-y-3 mt-6"><Input type="password" placeholder="Senha administrativa" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") authenticateAdmin(); }} autoFocus /><Button className="w-full" onClick={authenticateAdmin}>Entrar</Button><Button variant="ghost" className="w-full" onClick={() => setAdminOpen(false)}>Cancelar</Button></div>
        </> : <>
          <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-green-100"><ShieldCheck className="w-5 h-5 text-green-700" /></div><div><h2 className="text-xl font-bold text-slate-900">Painel administrativo</h2><p className="text-sm text-slate-500">Ajustar registros de limpeza.</p></div></div><Button variant="ghost" size="sm" onClick={() => { setAdminAuthenticated(false); setAdminOpen(false); }}><LogOut className="w-4 h-4" /></Button></div>
          <div className="mt-6 rounded-xl border bg-slate-50 p-4 space-y-4"><div><label className="text-sm font-medium text-slate-700">Quarto</label><select className="mt-1 flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm" value={adminRoom} onChange={(e) => setAdminRoom(Number(e.target.value))}>{ROOMS.map((room) => <option key={room} value={room}>Quarto {room}</option>)}</select></div><div><label className="text-sm font-medium text-slate-700">Data em que a limpeza ocorreu</label><Input className="mt-1 bg-white" type="date" value={adminDate} onChange={(e) => setAdminDate(e.target.value)} /></div><Button className="w-full" onClick={() => adminAddCleaning.mutate()} disabled={adminAddCleaning.isPending || !adminDate}>{adminAddCleaning.isPending ? "Registrando..." : "Registrar limpeza retroativa"}</Button></div>
          {adminSavedMessage && <div className="mt-4 p-4 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800"><p className="font-bold">Registro salvo</p><p className="mt-1">{adminSavedMessage}</p></div>}<div className="mt-5 p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800">Use esta opção para corrigir os dias em que as limpezas aconteceram enquanto o aplicativo estava parado ou quando algum quarto esqueceu de registrar.</div>
        </>}
      </div>
    </div>}
  </div>;
}
