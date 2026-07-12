alter table public.images
  add column if not exists model_details jsonb;

alter table public.images
  drop constraint if exists images_model_details_shape,
  add constraint images_model_details_shape
    check (
      model_details is null
      or (
        jsonb_typeof(model_details) = 'object'
        and jsonb_typeof(model_details->'model') = 'string'
        and (
          not (model_details ? 'size')
          or model_details->'size' = 'null'::jsonb
          or jsonb_typeof(model_details->'size') = 'string'
        )
        and (
          not (model_details ? 'resolution')
          or model_details->'resolution' = 'null'::jsonb
          or jsonb_typeof(model_details->'resolution') = 'string'
        )
        and (
          not (model_details ? 'outputFormat')
          or model_details->'outputFormat' = 'null'::jsonb
          or jsonb_typeof(model_details->'outputFormat') = 'string'
        )
        and (
          not (model_details ? 'durationMs')
          or model_details->'durationMs' = 'null'::jsonb
          or jsonb_typeof(model_details->'durationMs') = 'number'
        )
        and (
          not (model_details ? 'duration_ms')
          or model_details->'duration_ms' = 'null'::jsonb
          or jsonb_typeof(model_details->'duration_ms') = 'number'
        )
      )
    );
