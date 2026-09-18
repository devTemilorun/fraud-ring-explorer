
export const listFlaggedAccounts = {
  text:  `
    MATCH (a:Account { flagged: true })
    OPTIONAL MATCH (p:Person)-[:OWNS]->(a)
    RETURN a.id            AS id,
           a.number        AS number,
           a.balance       AS balance,
           a.openedAt      AS openedAt,
           a.flagged       AS flagged,
           collect(DISTINCT p.name) AS owners
    ORDER BY a.balance DESC
    LIMIT $limit
  `,
  params: ({ limit = 50 } = {}) => ({ limit: neo4jInt(limit) }),
};


export const ringsAroundFlaggedAccount = {
  text:  `
    MATCH (flagged:Account { flagged: true })
    MATCH path = (flagged)<-[:OWNS]-(p1:Person)
                 -[:LIVES_AT|USES_PHONE*1..2]-(p2:Person)
                 -[:OWNS]->(other:Account)
    WHERE other <> flagged
    WITH flagged, other, path,
         [n IN nodes(path) WHERE n:Person | n.id]  AS people,
         [n IN nodes(path) WHERE n:Address | n.id] AS addresses,
         [n IN nodes(path) WHERE n:Phone   | n.id] AS phones
    RETURN flagged.id   AS flaggedId,
           other.id     AS otherId,
           length(path) AS hops,
           people       AS personIds,
           addresses    AS addressIds,
           phones       AS phoneIds
    ORDER BY hops ASC, otherId ASC
    LIMIT $limit
  `,
  params: ({ limit = 200 } = {}) => ({ limit: neo4jInt(limit) }),
};


export const shortestAccountPath = {
  text:  `
    MATCH (a:Account { id: $fromId }), (b:Account { id: $toId })
    MATCH path = shortestPath(
      (a)-[:OWNS|LIVES_AT|USES_PHONE|TRANSACTED_WITH*..8]-(b)
    )
    RETURN [n IN nodes(path) | { id: n.id, label: head(labels(n)) }] AS nodes,
           [r IN relationships(path) | type(r)] AS rels,
           length(path) AS hops
  `,
  params: ({ fromId, toId }) => ({ fromId, toId }),
};


export const topConnectorsInRing = {
  text:  `
    MATCH (flagged:Account { flagged: true })
    MATCH (p:Person)-[:OWNS]->(flagged)
    WITH p, count { (p)-[:OWNS]->(:Account { flagged: true }) } AS directFlagged,
            count { (p)-[:LIVES_AT|USES_PHONE]-(:Person)-[:OWNS]->(:Account { flagged: true }) } AS indirectFlagged
    WITH p, directFlagged, indirectFlagged, directFlagged + indirectFlagged AS score
    WHERE score > 0
    RETURN p.id    AS id,
           p.name  AS name,
           p.riskScore AS riskScore,
           directFlagged,
           indirectFlagged,
           score
    ORDER BY score DESC, p.riskScore DESC
    LIMIT $limit
  `,
  params: ({ limit = 25 } = {}) => ({ limit: neo4jInt(limit) }),
};


export function neighborhood(hops) {
  const safeHops = Math.min(Math.max(neo4jInt(hops) || 2, 1), 3);
  return {
    text:  `
      MATCH (root:Account { id: $rootId })
      MATCH path = (root)-[*1..${safeHops}]-(n)
      WITH root, path
      UNWIND nodes(path) AS node
      WITH root, collect(DISTINCT node) AS allNodes, collect(DISTINCT path) AS paths
      UNWIND paths AS p
      UNWIND relationships(p) AS rel
      WITH allNodes, collect(DISTINCT rel) AS allRels
      RETURN
        [n IN allNodes | {
          id: n.id,
          label: head(labels(n)),
          name: coalesce(n.name, n.number, n.line1, n.number, n.id),
          flagged: coalesce(n.flagged, false),
          riskScore: coalesce(n.riskScore, 0),
          balance: coalesce(n.balance, 0)
        }] AS nodes,
        [r IN allRels | {
          source: startNode(r).id,
          target: endNode(r).id,
          type: type(r)
        }] AS edges
    `,
    params: ({ rootId }) => ({ rootId }),
  };
}


export const searchAccounts = {
  text:  `
    MATCH (a:Account)
    OPTIONAL MATCH (p:Person)-[:OWNS]->(a)
    WITH a, collect(DISTINCT coalesce(p.name, '')) AS owners
    WHERE $q = ''
       OR toLower(a.number) CONTAINS toLower($q)
       OR any(name IN owners WHERE toLower(name) CONTAINS toLower($q))
    RETURN a.id AS id,
           a.number AS number,
           a.flagged AS flagged,
           a.balance AS balance,
           owners
    ORDER BY a.flagged DESC, a.balance DESC
    LIMIT $limit
  `,
  params: ({ q = '', limit = 25 }) => ({ q, limit: neo4jInt(limit) }),
  timeoutMs: 8000,
};

// Neo4j's JS driver integers 
function neo4jInt(n) {
  return Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : 0;
}