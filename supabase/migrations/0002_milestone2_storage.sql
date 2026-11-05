-- Private bucket for the four CV files. Service-role uploads also create
-- this bucket on first use, so a project that already ran 0001 can upload
-- before this statement is applied.

insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;
