
import { loadConfig } from '../src/config.js';
import { getDriver, verifyConnectivity, closeDriver, withSession } from '../src/db.js';

const config = loadConfig({ soft: true });
if (!config) {
  console.error(
    '\n  ✖ Missing COGNODB_URI / COGNODB_USER / COGNODB_PASSWORD.\n' +
    '    Copy .env.example to .env and fill in your CognoDB credentials.\n',
  );
  process.exit(1);
}

const RESET_ONLY = process.argv.includes('--reset');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20240617);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const round2 = (n) => Math.round(n * 100) / 100;
const iso = (d) => d.toISOString();

const FIRST = ['Amara','Diego','Mei','Yusuf','Priya','Lars','Nadia','Kwame','Sofia','Ivan','Aisha','Tomás','Hana','Omar','Elena','Ravi','Chiara','Jonas','Zara','Mateo','Ingrid','Kofi','Leila','Petr','Anika','Bashir','Freya','Hugo','Iris','Jamal'];
const LAST  = ['Okafor','Ramírez','Chen','Haddad','Sharma','Andersen','Petrova','Mensah','Rossi','Novak','Ali','Costa','Kim','Farouk','Vargas','Patel','Bianchi','Berg','Ahmed','Silva','Larsen','Boateng','Nasser','Dvořák','Singh','Aziz','Holm','Moreau','Costa','Diallo'];
const STREETS = ['Marlowe','Kestrel','Bridgewater','Hawthorn','Cobalt','Sable','Linden','Archer','Ravenswood','Quarry','Willow','Granite','Fable','Ivy','Mercer'];
const CITIES = [
  { city: 'London',        country: 'GB' },
  { city: 'Lagos',         country: 'NG' },
  { city: 'São Paulo',     country: 'BR' },
  { city: 'Mumbai',        country: 'IN' },
  { city: 'Berlin',        country: 'DE' },
  { city: 'Toronto',       country: 'CA' },
  { city: 'Dubai',         country: 'AE' },
  { city: 'Singapore',     country: 'SG' },
];
const COMPANIES = ['Kestrel Holdings','Marlowe Trading','Blue Harbour Logistics','Archer Capital','Cobalt Partners','Linden Freight','Ravenswood Imports','Quarry Metals','Granite Consulting','Willow Ventures','Fable Media','Mercer Shipping'];

function buildDataset({ peopleCount, accountsCount }) {
  const people = [];
  const accounts = [];
  const companies = [];
  const addresses = [];
  const phones = [];

  // People
  for (let i = 0; i < peopleCount; i++) {
    const id = `P-${String(i + 1).padStart(3, '0')}`;
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    people.push({
      id,
      name,
      dob: iso(new Date(Date.UTC(randInt(1960, 2000), randInt(0, 11), randInt(1, 28)))),
      riskScore: randInt(1, 100),
    });
  }

  // Accounts
  for (let i = 0; i < accountsCount; i++) {
    const id = `A-${String(i + 1).padStart(4, '0')}`;
    accounts.push({
      id,
      number: `GB${randInt(10, 99)}WEXA${String(randInt(0, 99999999)).padStart(8, '0')}`,
      balance: round2(randInt(100, 250_000) + rand()),
      openedAt: iso(new Date(Date.UTC(randInt(2016, 2024), randInt(0, 11), randInt(1, 28)))),
      flagged: false,
    });
  }

  // Companies
  for (let i = 0; i < 25; i++) {
    companies.push({
      id: `C-${String(i + 1).padStart(3, '0')}`,
      name: `${pick(COMPANIES)} ${randInt(1, 99)}`,
      incorporationDate: iso(new Date(Date.UTC(randInt(1995, 2023), randInt(0, 11), randInt(1, 28)))),
      country: pick(CITIES).country,
    });
  }

  // Addresses (shared by people AND companies)
  for (let i = 0; i < 60; i++) {
    const { city, country } = pick(CITIES);
    addresses.push({
      id: `AD-${String(i + 1).padStart(3, '0')}`,
      line1: `${randInt(1, 400)} ${pick(STREETS)} ${pick(['St','Ave','Rd','Lane'])}`,
      city,
      postal: String(randInt(10000, 99999)),
      country,
    });
  }

  // Phones
  for (let i = 0; i < 90; i++) {
    phones.push({
      id: `PH-${String(i + 1).padStart(3, '0')}`,
      number: `+${randInt(1, 99)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    });
  }

  // OWNS edges: every account belongs to 1–2 people.
  const owns = [];
  for (const acct of accounts) {
    const owners = rand() < 0.15 ? 2 : 1;
    for (let k = 0; k < owners; k++) {
      const p = pick(people);
      owns.push({
        personId: p.id,
        accountId: acct.id,
        since: iso(new Date(Date.UTC(randInt(2016, 2024), randInt(0, 11), randInt(1, 28)))),
      });
    }
  }

  const livesAt = [];
  const usesPhone = [];
  const sharedAddresses = addresses.slice(0, 8); 
  const sharedPhones = phones.slice(0, 12);       

  for (const p of people) {
    const addr = rand() < 0.25 ? pick(sharedAddresses) : pick(addresses);
    livesAt.push({
      personId: p.id,
      addressId: addr.id,
      since: iso(new Date(Date.UTC(randInt(2010, 2024), randInt(0, 11), randInt(1, 28)))),
    });
    const phone = rand() < 0.3 ? pick(sharedPhones) : pick(phones);
    usesPhone.push({
      personId: p.id,
      phoneId: phone.id,
      since: iso(new Date(Date.UTC(randInt(2010, 2024), randInt(0, 11), randInt(1, 28)))),
    });
  }

  const registeredAt = [];
  const directorOf = [];
  for (const c of companies) {
    const addr = pick(sharedAddresses);
    registeredAt.push({ companyId: c.id, addressId: addr.id });
    const p = pick(people);
    directorOf.push({
      personId: p.id,
      companyId: c.id,
      since: iso(new Date(Date.UTC(randInt(2010, 2024), randInt(0, 11), randInt(1, 28)))),
    });
  }

  const transactions = [];
  for (let i = 0; i < accountsCount * 2; i++) {
    const a = pick(accounts);
    const b = pick(accounts);
    if (a.id === b.id) continue;
    transactions.push({
      fromId: a.id,
      toId: b.id,
      count: randInt(1, 40),
      totalAmount: round2(randInt(500, 500_000) + rand()),
      lastAt: iso(new Date(Date.UTC(randInt(2023, 2024), randInt(0, 11), randInt(1, 28)))),
    });
  }


  const ringAddresses = sharedAddresses.slice(0, 3);
  const ringPhones    = sharedPhones.slice(0, 3);
  const ringPeople    = [];
  const ringAccounts  = [];

  for (let r = 0; r < 3; r++) {
    const members = [];
    for (let m = 0; m < 4; m++) {
      const p = {
        id: `P-R${r + 1}-${m + 1}`,
        name: `${pick(FIRST)} ${pick(LAST)} (ring ${r + 1})`,
        dob: iso(new Date(Date.UTC(randInt(1975, 1995), randInt(0, 11), randInt(1, 28)))),
        riskScore: randInt(70, 99),
      };
      people.push(p);
      members.push(p);

      // Force shared address and phone.
      livesAt.push({ personId: p.id, addressId: ringAddresses[r].id, since: iso(new Date()) });
      usesPhone.push({ personId: p.id, phoneId: ringPhones[r].id, since: iso(new Date()) });

      const acct = {
        id: `A-R${r + 1}-${m + 1}`,
        number: `GB${randInt(10, 99)}WEXA${String(randInt(0, 99999999)).padStart(8, '0')}`,
        balance: round2(randInt(50_000, 500_000) + rand()),
        openedAt: iso(new Date(Date.UTC(2023, randInt(0, 11), randInt(1, 28)))),
        flagged: m === 0, 
      };
      accounts.push(acct);
      ringAccounts.push(acct);
      owns.push({ personId: p.id, accountId: acct.id, since: iso(new Date()) });
    }
    ringPeople.push(members);
  }

  // Hub account each ring funnels through.
  const hubAccounts = [];
  for (let r = 0; r < 3; r++) {
    const hub = {
      id: `A-HUB-${r + 1}`,
      number: `GB${randInt(10, 99)}WEXAHUB${String(randInt(0, 999999)).padStart(6, '0')}`,
      balance: round2(randInt(1_000_000, 5_000_000) + rand()),
      openedAt: iso(new Date(Date.UTC(2022, randInt(0, 11), randInt(1, 28)))),
      flagged: false,
    };
    accounts.push(hub);
    hubAccounts.push(hub);
    for (let m = 0; m < 4; m++) {
      transactions.push({
        fromId: ringAccounts[r * 4 + m].id,
        toId: hub.id,
        count: randInt(5, 60),
        totalAmount: round2(randInt(10_000, 200_000) + rand()),
        lastAt: iso(new Date(Date.UTC(2024, randInt(0, 11), randInt(1, 28)))),
      });
    }
  }

  return {
    people, accounts, companies, addresses, phones,
    owns, livesAt, usesPhone, registeredAt, directorOf, transactions,
  };
}

// Loader
async function wipe(session) {
  await session.run('MATCH (n) DETACH DELETE n');
}

async function load(session, data) {
  // Nodes
  await session.run(
    `UNWIND $rows AS row
     MERGE (p:Person { id: row.id })
     SET p.name = row.name, p.dob = row.dob, p.riskScore = row.riskScore`,
    { rows: data.people },
  );
  await session.run(
    `UNWIND $rows AS row
     MERGE (a:Account { id: row.id })
     SET a.number = row.number, a.balance = row.balance,
         a.openedAt = row.openedAt, a.flagged = row.flagged`,
    { rows: data.accounts },
  );
  await session.run(
    `UNWIND $rows AS row
     MERGE (c:Company { id: row.id })
     SET c.name = row.name, c.incorporationDate = row.incorporationDate, c.country = row.country`,
    { rows: data.companies },
  );
  await session.run(
    `UNWIND $rows AS row
     MERGE (ad:Address { id: row.id })
     SET ad.line1 = row.line1, ad.city = row.city,
         ad.postal = row.postal, ad.country = row.country`,
    { rows: data.addresses },
  );
  await session.run(
    `UNWIND $rows AS row
     MERGE (ph:Phone { id: row.id })
     SET ph.number = row.number`,
    { rows: data.phones },
  );

  // Indexes — safe to re-run.
  for (const stmt of [
    'CREATE INDEX person_id IF NOT EXISTS FOR (p:Person) ON (p.id)',
    'CREATE INDEX account_id IF NOT EXISTS FOR (a:Account) ON (a.id)',
    'CREATE INDEX account_flagged IF NOT EXISTS FOR (a:Account) ON (a.flagged)',
    'CREATE INDEX company_id IF NOT EXISTS FOR (c:Company) ON (c.id)',
    'CREATE INDEX address_id IF NOT EXISTS FOR (ad:Address) ON (ad.id)',
    'CREATE INDEX phone_id IF NOT EXISTS FOR (ph:Phone) ON (ph.id)',
  ]) {
    try { await session.run(stmt); } catch {  }
  }

  // Relationships
  await session.run(
    `UNWIND $rows AS row
     MATCH (p:Person { id: row.personId }), (a:Account { id: row.accountId })
     MERGE (p)-[r:OWNS]->(a)
     SET r.since = row.since`,
    { rows: data.owns },
  );
  await session.run(
    `UNWIND $rows AS row
     MATCH (p:Person { id: row.personId }), (ad:Address { id: row.addressId })
     MERGE (p)-[r:LIVES_AT]->(ad)
     SET r.since = row.since`,
    { rows: data.livesAt },
  );
  await session.run(
    `UNWIND $rows AS row
     MATCH (p:Person { id: row.personId }), (ph:Phone { id: row.phoneId })
     MERGE (p)-[r:USES_PHONE]->(ph)
     SET r.since = row.since`,
    { rows: data.usesPhone },
  );
  await session.run(
    `UNWIND $rows AS row
     MATCH (c:Company { id: row.companyId }), (ad:Address { id: row.addressId })
     MERGE (c)-[:REGISTERED_AT]->(ad)`,
    { rows: data.registeredAt },
  );
  await session.run(
    `UNWIND $rows AS row
     MATCH (p:Person { id: row.personId }), (c:Company { id: row.companyId })
     MERGE (p)-[r:DIRECTOR_OF]->(c)
     SET r.since = row.since`,
    { rows: data.directorOf },
  );
  await session.run(
    `UNWIND $rows AS row
     MATCH (a:Account { id: row.fromId }), (b:Account { id: row.toId })
     MERGE (a)-[r:TRANSACTED_WITH]->(b)
     SET r.count = row.count, r.totalAmount = row.totalAmount, r.lastAt = row.lastAt`,
    { rows: data.transactions },
  );
}

// Main
async function main() {
  console.log(`→ CognoDB: ${config.uri.replace(/\/\/.*@/, '//***@')}`);

  const conn = await verifyConnectivity();
  if (!conn.ok) {
    console.error(`\n  ✖ Cannot reach CognoDB: ${conn.message}\n`);
    process.exitCode = 1;
    await closeDriver();
    return;
  }
  console.log('  ✓ connectivity OK');

  await withSession(async (session) => {
    console.log('→ wiping existing data');
    await wipe(session);

    if (RESET_ONLY) {
      console.log('  ✓ reset complete (no seed)');
      return;
    }

    const data = buildDataset({
      peopleCount: config.seedPeople,
      accountsCount: config.seedAccounts,
    });

    console.log(
      `→ seeding: ${data.people.length} people, ${data.accounts.length} accounts, ` +
      `${data.companies.length} companies, ${data.addresses.length} addresses, ` +
      `${data.phones.length} phones`,
    );
    console.log(
      `  edges: ${data.owns.length} OWNS, ${data.livesAt.length} LIVES_AT, ` +
      `${data.usesPhone.length} USES_PHONE, ${data.directorOf.length} DIRECTOR_OF, ` +
      `${data.transactions.length} TRANSACTED_WITH`,
    );

    await load(session, data);
    console.log('  ✓ seed complete');
  });

  await closeDriver();
}

main().catch(async (err) => {
  console.error('Seed failed:', err.message);
  try { await closeDriver(); } catch {  }
  process.exit(1);
});
