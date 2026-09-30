CREATE INDEX evidence_latest_by_lead ON public.creator_evidence(workspace,lead_id,retrieved_at DESC,id DESC);
CREATE INDEX evidence_permitted_content_search ON public.creator_evidence USING gin
 (to_tsvector('english',coalesce(observation->>'teachingTopic','') || ' ' || coalesce(observation->>'contentExcerpt','')))
 WHERE observation->>'rightsAttested'='true' AND observation->>'contentUrl' IS NOT NULL;
