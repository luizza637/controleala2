ALTER TABLE public.cleaning_logs
  ADD CONSTRAINT cleaning_logs_room_number_valid CHECK (room_number IN (6, 7, 8, 9, 10));

ALTER TABLE public.cleaning_logs
  ADD CONSTRAINT cleaning_logs_status_valid CHECK (status IN ('concluido'));

ALTER TABLE public.cleaning_logs
  ADD CONSTRAINT cleaning_logs_completed_at_not_future CHECK (completed_at <= now() + interval '5 minutes');