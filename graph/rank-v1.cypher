MATCH (s:VestiSession {id: $sessionId})-[:HAS_RUN]->(r:VestiRun {id: $runId})-[:SELECTED]->(g:VestiGarment)
MATCH (r)-[:FOUND]->(l:VestiListing)-[:OFFERS]->(p:VestiProduct)
WHERE l.verification = 'verified' AND l.availability <> 'out_of_stock'
  AND ($merchant IS NULL OR l.merchantDomain = $merchant)
  AND ($currency IS NULL OR l.currency = $currency)
  AND ($maxMinor IS NULL OR (l.priceMinor IS NOT NULL AND l.priceMinor <= $maxMinor))
  AND ($category IS NULL OR EXISTS { MATCH (p)-[:HAS_ATTRIBUTE]->(:VestiAttribute {key: 'category:' + $category}) })
  AND ($colour IS NULL OR EXISTS { MATCH (p)-[:HAS_ATTRIBUTE]->(:VestiAttribute {key: 'colour:' + $colour}) })
  AND NOT EXISTS {
    MATCH (g)-[:HAS_ATTRIBUTE]->(gc:VestiAttribute {kind: 'category'}), (p)-[:HAS_ATTRIBUTE]->(pc:VestiAttribute {kind: 'category'}) WHERE gc.key <> pc.key
  }
MATCH (g)-[ga:HAS_ATTRIBUTE]->(a:VestiAttribute)
WHERE a.kind <> 'style' AND (a.kind <> 'material' OR ga.source = 'user' OR ga.evidence IS NOT NULL)
OPTIONAL MATCH (p)-[pa:HAS_ATTRIBUTE]->(a)
WITH s,r,g,l,p, collect({kind:a.kind,key:a.key, value:a.value, confidence:coalesce(ga.confidence,0.5), matched:pa IS NOT NULL, evidence:pa.evidence, productConfidence:coalesce(pa.confidence,0.5)}) AS attrs
OPTIONAL MATCH (g)-[gs:IN_STYLE]->(style:VestiStyle)
OPTIONAL MATCH (p)-[ps:IN_STYLE]->(style)
WITH s,r,l,p,attrs,collect(CASE WHEN style IS NULL THEN null ELSE {kind:'style',key:style.key,value:style.value,confidence:coalesce(gs.confidence,0.5),matched:ps IS NOT NULL,evidence:ps.evidence,productConfidence:coalesce(ps.confidence,0.5)} END) AS styles
WITH s,r,l,p,attrs + styles AS attrs
WITH s,r,l,p, attrs, [kind IN ['category','colour','pattern','style','material'] |
 {kind:kind, weight:CASE kind WHEN 'category' THEN 0.35 WHEN 'colour' THEN 0.25 WHEN 'pattern' THEN 0.15 WHEN 'style' THEN 0.15 ELSE 0.10 END,
 active: any(a IN attrs WHERE a.kind = kind),
 overlap: reduce(total=0.0,a IN [a IN attrs WHERE a.kind=kind] | total + CASE WHEN a.matched THEN a.confidence * a.productConfidence ELSE 0.0 END) /
 CASE WHEN size([a IN attrs WHERE a.kind=kind])=0 THEN 1.0 ELSE toFloat(size([a IN attrs WHERE a.kind=kind])) END}] AS components
WITH s,r,l,attrs,components, reduce(total=0.0,c IN components | total + CASE WHEN c.active THEN c.weight ELSE 0.0 END) AS denominator
WHERE denominator > 0
WITH s,r,l,attrs,components, reduce(total=0.0,c IN components | total + c.weight*c.overlap)/denominator AS score
ORDER BY score DESC, l.checkedAt DESC, l.id ASC
LIMIT 6
MERGE (r)-[rec:RECOMMENDS]->(l)
SET rec.score=score,rec.version='attribute-v1',rec.matchedKeys=[a IN attrs WHERE a.matched AND a.evidence IS NOT NULL | a.key]
RETURN l.payload AS payload,l.id AS id,score,components,
 [a IN attrs WHERE a.matched AND a.evidence IS NOT NULL | {attributeKey:a.key,evidence:a.evidence}][..3] AS reasons
