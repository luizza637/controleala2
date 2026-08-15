import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Clock, RotateCcw, History, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, addDays, isSameDay, isAfter, isBefore, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  component: Index,
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
      .channel("cleaning_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cleaning_logs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["cleaning_logs"] });
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
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Bem-vinda!</h1>
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

  // Simple Rotation Logic: If room X cleaned last, next is (X-6+1)%5 + 6
  const getResponsibleRoom = () => {
    if (!lastCleaning) return 6;
    if (isCompleted) {
        // Se já foi concluído hoje/nesta escala, o PRÓXIMO responsável será:
        return ((lastCleaning.room_number - 6 + 1) % 5) + 6;
    }
    // Se ainda não foi concluído e a última limpeza foi do Quarto 8, o responsável ATUAL é o 9.
    // Mas a lógica geral é: o responsável é sempre o sucessor do último que limpou.
    return ((lastCleaning.room_number - 6 + 1) % 5) + 6;
  };

  const responsibleRoom = getResponsibleRoom();

  const getStatus = () => {
    if (isCompleted) return { label: "Concluído", color: "bg-green-500", icon: <CheckCircle2 className="w-6 h-6" /> };
    if (isCleaningDay) return { label: "No Prazo", color: "bg-yellow-500", icon: <Clock className="w-6 h-6" /> };
    return { label: "Atrasado", color: "bg-red-500", icon: <AlertCircle className="w-6 h-6" /> };
  };

  const status = getStatus();

  return (
    <div className="min-h-screen bg-slate-50 pb-10 font-sans selection:bg-primary/20">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 sticky top-0 z-10 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-2 rounded-lg text-white">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Ala 2 Control</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setIsChangingRoom(true)} className="text-slate-500 hover:text-primary">
          <RotateCcw className="w-4 h-4 mr-2" />
          Q. {myRoom}
        </Button>
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
              {isCompleted 
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
            
            {!isCompleted && (
              <Button 
                className="w-full mt-6 h-14 text-lg font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
                onClick={() => finishCleaning.mutate()}
                disabled={finishCleaning.isPending}
              >
                {finishCleaning.isPending ? "Salvando..." : "Marcar como Finalizado"}
              </Button>
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
