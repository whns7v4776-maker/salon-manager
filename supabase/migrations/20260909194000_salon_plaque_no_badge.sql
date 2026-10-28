begin;
alter table public.salon_logo_plaques drop constraint salon_logo_plaques_finish_check;
alter table public.salon_logo_plaques add constraint salon_logo_plaques_finish_check
  check (finish in ('none','satin','glass','metal'));
commit;
