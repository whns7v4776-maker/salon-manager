-- No table writes: exercise the exact migration normalization with local values.
do $test$
declare p_items jsonb; v_item_count integer; fixture jsonb;
begin
for fixture in select value from jsonb_array_elements('[{"input":[0,1],"expected":[1,2]},{"input":[1,2],"expected":[1,2]},{"input":[1,0],"expected":[2,1]},{"input":[0],"expected":[1]},{"input":[0,0],"expected":[0,0]},{"input":[0,2],"expected":[0,2]},{"input":[null,1],"expected":[null,1]},{"input":[-1,0],"expected":[-1,0]}]'::jsonb)
loop
 select jsonb_agg(jsonb_build_object('appointmentGroupOrder',value,'durationMinutes',45)) into p_items from jsonb_array_elements(fixture->'input');
 v_item_count:=jsonb_array_length(p_items);

  -- Legacy compositions use 0..N-1. Shift only a complete, unique sequence;
  -- preserve array order and every other field. Invalid plans stay invalid.
  if (
    select bool_and(coalesce(item ->> 'appointmentGroupOrder', '') ~ '^[0-9]{1,9}$')
    from jsonb_array_elements(p_items) as plan(item)
  ) then
    if (
      select min((item ->> 'appointmentGroupOrder')::integer) = 0
        and max((item ->> 'appointmentGroupOrder')::integer) = v_item_count - 1
        and count(distinct (item ->> 'appointmentGroupOrder')::integer) = v_item_count
      from jsonb_array_elements(p_items) as plan(item)
    ) then
      select jsonb_agg(
        jsonb_set(item, '{appointmentGroupOrder}',
          to_jsonb((item ->> 'appointmentGroupOrder')::integer + 1))
        order by position
      ) into p_items
      from jsonb_array_elements(p_items) with ordinality as plan(item, position);
    end if;
  end if;

 if (select jsonb_agg(item->'appointmentGroupOrder') from jsonb_array_elements(p_items) p(item)) <> fixture->'expected' then raise exception 'fixture failed %',fixture; end if;
 if exists(select 1 from jsonb_array_elements(p_items) p(item) where item->>'durationMinutes' <> '45') then raise exception 'duration changed'; end if;
end loop;
end $test$;

