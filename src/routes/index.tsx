import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Clock, RotateCcw, History, LayoutDashboard, Calendar, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, addDays, isSameDay, isAfter, isBefore, subDays, parseISO, nextDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Ala 2 Control — Escala de Limpeza dos Quartos 6 a 10" },
      {
        name: "description",
        content:
          "Veja quem é o quarto responsável pela limpeza da Ala 2, marque como concluída e acompanhe o histórico e as próximas datas em tempo real.",
      },
      { property: "og:title", content: "Ala 2 Control — Escala de Limpeza" },
      {
        property: "og:description",
        content:
          "Escala de limpeza da Ala 2 em tempo real: responsável da vez, status, próximas datas e histórico dos quartos 6 a 10.",
      },
      { property: "og:url", content: "https://controleala2.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://controleala2.lovable.app/" }],
  }),
});

const ROOMS = [6, 7, 8, 9, 10];
const CLEANING_DAYS = [1, 4]; // Monday (1) and Thursday (4)

function Index() {
  const [myRoom, setMyRoom] = useState<number | null>(null);
  const [isChangingRoom, setIsChangingRoom] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const savedRoom = localStorage.getItem("user_room");
    if (savedRoom) {
      setMyRoom(parseInt(savedRoom, 10));
    }
  }, []);

  const handleSelectRoom = (room: number) => {
    setMyRoom(room);
    localStorage.setItem("user_room", room.toString());
    setIsChangingRoom(false);
    toast.success(`Quarto ${room} selecionado!`);
  };

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("app_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cleaning_logs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["cleaning_logs"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["app_settings"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["cleaning_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_logs")
        .select("*")
        .order("completed_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  const { data: appSettings } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings" as any)
        .select("*")
        .eq("key", "is_paused")
        .single();
      if (error) {
        if (error.code === 'PGRST116') return { value: false };
        throw error;
      }
      return data as any;
    },
  });

  const isPaused = appSettings?.value === true;

  const togglePause = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings" as any)
        .upsert({ key: "is_paused", value: !isPaused } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isPaused ? "Aplicativo retomado!" : "Aplicativo pausado para férias!");
      queryClient.invalidateQueries({ queryKey: ["app_settings"] });
    },
    onError: (error) => {
      toast.error("Erro ao alterar status: " + error.message);
    },
  });

  const finishCleaning = useMutation({
    mutationFn: async () => {
      if (!myRoom) throw new Error("Quarto não selecionado");
      const { error } = await supabase.from("cleaning_logs").insert({
        room_number: myRoom,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limpeza finalizada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["cleaning_logs"] });
    },
    onError: (error) => {
      toast.error("Erro ao finalizar limpeza: " + error.message);
    },
  });

  if (!myRoom || isChangingRoom) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 animate-in fade-in duration-500">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Selecione seu Quarto — Ala 2 Control</h1>
        <p className="text-slate-600 mb-8 text-center">Para começar, selecione o seu quarto da Ala 2:</p>
        <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
          {ROOMS.map((room) => (
            <Button
              key={room}
              variant="outline"
              className="h-20 text-xl font-bold hover:bg-primary hover:text-white transition-colors border-2"
              onClick={() => handleSelectRoom(room)}
            >
              Quarto {room}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Logic for Status and Next Responsible
  const now = new Date();
  const todayDay = now.getDay();
  
  // Calculate most recent scheduled cleaning day
  const getMostRecentCleaningDay = () => {
    let d = new Date(now);
    d.setHours(0, 0, 0, 0);
    // Find the current or previous Monday (1) or Thursday (4)
    while (!CLEANING_DAYS.includes(d.getDay())) {
      d = subDays(d, 1);
    }
    return d;
  };

  const scheduledDay = getMostRecentCleaningDay();
  const isCleaningDay = CLEANING_DAYS.includes(todayDay);
  
  const lastCleaning = logs?.[0];
  const lastCleaningDate = lastCleaning ? new Date(lastCleaning.completed_at) : null;
  
  const isCompleted = lastCleaningDate && (isSameDay(lastCleaningDate, now) || (isAfter(lastCleaningDate, scheduledDay) && !isBefore(lastCleaningDate, scheduledDay)));

  // Rotação: 6 -> 7 -> 8 -> 9 -> 10 -> 6
  const getResponsibleRoom = () => {
    // Se não há logs, começamos pelo 6
    if (!logs || logs.length === 0) return 6;
    
    const lastLog = logs[0];
    if (!lastLog) return 6;
    
    const lastRoom = lastLog.room_number;
    const lastDate = new Date(lastLog.completed_at);
    
    return ((lastRoom - 6 + 1) % 5) + 6;
  };

  const responsibleRoom = getResponsibleRoom();
  const isMyTurn = myRoom === responsibleRoom;

  const getStatus = () => {
    if (isCompleted) return { label: "Concluído", color: "bg-green-500", icon: <CheckCircle2 className="w-6 h-6" /> };
    if (isCleaningDay) return { label: "No Prazo", color: "bg-yellow-500", icon: <Clock className="w-6 h-6" /> };
    return { label: "Atrasado", color: "bg-red-500", icon: <AlertCircle className="w-6 h-6" /> };
  };

  const status = isPaused 
    ? { label: "Em Férias", color: "bg-slate-500", icon: <Pause className="w-6 h-6" /> }
    : getStatus();

  // Logic for Future Schedule
  const getFutureSchedule = () => {
    const schedule = [];
    if (!logs || logs.length === 0) return [];

    const lastLog = logs[0];
    if (!lastLog) return [];

    const lastRoom = lastLog.room_number;
    const lastDate = new Date(lastLog.completed_at);
    
    let nextRoom = ((lastRoom - 6 + 1) % 5) + 6;
    
    // Começamos a projetar a partir do dia seguinte à última limpeza
    let checkDate = new Date(lastDate);
    checkDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < 6; i++) {
      // Encontra o próximo dia de limpeza
      do {
        checkDate = addDays(checkDate, 1);
      } while (!CLEANING_DAYS.includes(checkDate.getDay()));

      schedule.push({
        date: new Date(checkDate),
        room: nextRoom
      });
      
      nextRoom = ((nextRoom - 6 + 1) % 5) + 6;
    }
    
    return schedule;
  };

  const futureSchedule = getFutureSchedule();

  return (
    <div className="min-h-screen bg-slate-50 pb-10 font-sans selection:bg-primary/20">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 sticky top-0 z-10 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-2 rounded-lg text-white">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight">Ala 2 Control<span className="block text-[11px] font-medium text-slate-500">Escala de Limpeza</span></h1>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => togglePause.mutate()} 
            className={`${isPaused ? 'text-green-600 hover:text-green-700' : 'text-slate-500 hover:text-red-500'}`}
          >
            {isPaused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
            {isPaused ? 'Retomar' : 'Férias'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsChangingRoom(true)} className="text-slate-500 hover:text-primary">
            <RotateCcw className="w-4 h-4 mr-2" />
            Q. {myRoom}
          </Button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Status Card */}
        <Card className={`text-white border-none shadow-lg transition-colors duration-500 ${status.color}`}>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardDescription className="text-white/80 font-medium uppercase tracking-wider text-xs">Status do Banheiro</CardDescription>
              {status.icon}
            </div>
            <CardTitle className="text-4xl font-black">{status.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-white/90 text-sm font-medium">
              {isPaused
                ? "O aplicativo está pausado para as férias. A escala voltará ao normal assim que retomado."
                : isCompleted 
                  ? `Limpo por último pelo Quarto ${lastCleaning?.room_number}`
                  : isCleaningDay 
                    ? "Hoje é dia de limpeza! Aguardando conclusão." 
                    : "A última limpeza ainda não foi realizada ou está pendente."}
            </p>
          </CardContent>
        </Card>

        {/* Responsible Room Card */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-slate-800">Responsável da Vez</CardTitle>
            <CardDescription>Escala de revezamento (6-10)</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center py-6">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-4 ring-8 ring-primary/5">
              <span className="text-4xl font-bold text-primary">{responsibleRoom}</span>
            </div>
            <p className="text-slate-600 text-center font-medium">
              Quarto {responsibleRoom} deve realizar a limpeza {isCleaningDay ? "hoje" : "na próxima data"}.
            </p>
            
            {!isCompleted && !isPaused && (
              <div className="w-full space-y-3 mt-6">
                {!isMyTurn && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-xs text-center font-medium animate-in fade-in slide-in-from-top-1">
                    Apenas o Quarto {responsibleRoom} pode marcar esta limpeza como concluída.
                  </div>
                )}
                <Button 
                  className="w-full h-14 text-lg font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
                  onClick={() => finishCleaning.mutate()}
                  disabled={finishCleaning.isPending || !isMyTurn}
                >
                  {finishCleaning.isPending ? "Salvando..." : "Marcar como Finalizado"}
                </Button>
              </div>
            )}
            {isPaused && (
              <div className="w-full mt-6 p-4 bg-slate-100 rounded-lg text-slate-500 text-center text-sm font-medium">
                Limpeza pausada durante as férias.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Schedule Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <p className="text-xs text-slate-500 font-bold uppercase mb-1">Frequência</p>
            <p className="text-sm font-semibold text-slate-800">2x por semana</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <p className="text-xs text-slate-500 font-bold uppercase mb-1">Dias</p>
            <p className="text-sm font-semibold text-slate-800">Segundas e Quintas</p>
          </div>
        </div>

        {/* Future Schedule (Agenda) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-slate-800 px-1">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="font-bold">Próximas Limpezas</h2>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="divide-y divide-slate-100">
              {futureSchedule.map((item, idx) => (
                <div key={idx} className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex flex-col items-center justify-center text-slate-500 font-bold text-[10px] uppercase leading-none">
                      <span>{format(item.date, "MMM", { locale: ptBR })}</span>
                      <span className="text-base text-slate-700">{format(item.date, "dd")}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Quarto {item.room}</p>
                      <p className="text-xs text-slate-500 capitalize">
                        {format(item.date, "eeee", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  {idx === 0 && !isCompleted && isCleaningDay && !isPaused && (
                    <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full uppercase tracking-wider">
                      Hoje
                    </span>
                  )}
                  {isPaused && idx === 0 && (
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-full uppercase tracking-wider">
                      Pausado
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* History */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-slate-800 px-1">
            <History className="w-5 h-5" />
            <h2 className="font-bold">Histórico Recente</h2>
          </div>
          <div className="space-y-2">
            {isLoading ? (
              <div className="text-center py-8 text-slate-400">Carregando histórico...</div>
            ) : logs?.length === 0 ? (
              <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-dashed">Nenhuma limpeza registrada ainda.</div>
            ) : (
              logs?.map((log) => (
                <div key={log.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center group hover:border-primary/30 transition-colors">
                  <div>
                    <p className="font-bold text-slate-800">Quarto {log.room_number}</p>
                    <p className="text-xs text-slate-500">
                      {format(new Date(log.completed_at), "eeee, d 'de' MMMM", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Horário</p>
                    <p className="text-sm font-mono font-bold text-primary">{format(new Date(log.completed_at), "HH:mm")}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
