# Craftverse — Implementierungs-Plan (Phase 1)

> Craftverse ist eine Web-App zum Pflegen und visuellen Erkunden von Crafting-Abhängigkeiten
> aus Spielen. Items werden aus anderen Items hergestellt; ein Canvas zeigt das Beziehungsnetz,
> eine Detailansicht den vollständigen Crafting-Baum. Jede Spiel-Datenbank ist ein **Atlas**.

## 1. Ziel & Scope

**Problem:** Crafting-Ketten in Spielen ("Auto = Glasscheibe + Metallblech + Motor; Motor = Metallblech + Öl …")
sind verschachtelt und schwer im Kopf zu behalten. Craftverse bildet diese Abhängigkeiten als pflegbares,
räumlich erkundbares Netz ab.

**Phase 1 (dieses Dokument):**
- Mehrere **Atlanten** (Spiel-Datenbanken) anlegen/wechseln/umbenennen/löschen.
- Items, Rezepte (mit Mengen), Zutaten und Herstellungsorte pflegen.
- **Canvas** als Hauptbühne: Items als Knoten, Abhängigkeiten als Kanten, nach Herstellungsort geclustert,
  Auto-Layout. Lesen *und* schnelles Editieren in derselben Fläche.
- **Detailseite** eines Items mit vollständigem, rekursivem Crafting-Baum (ODER-Verzweigung bei mehreren Rezepten).
- Suche, die Knoten im Canvas fokussiert/hervorhebt.
- Komplette App hinter Keycloak-Login.

**Explizit NICHT in Phase 1 (Phase 2+):**
- Pro-User-Inventar ("was habe ich, wie viel"), Grün-Markierung im Baum, "habe ich gecraftet" → Inventar hochzählen.
- Pfad-Auswahl bei Mehrfach-Rezepten + aggregierte Gesamt-Stückliste / Orte-Liste.
- Medien/Bilder an Items (Upload-Komplexität bewusst ausgeklammert).
- Linien-Ziehen ist enthalten; weitergehende Massen-Pflege (Tabellen-Ansicht) ist Phase 2.
- Settings-Seiten, Selbst-Registrierung, per-User-Datentrennung.

**Zielnutzer:** Eingeladene Nutzer (manuell in Keycloak angelegt). Alle arbeiten auf **derselben geteilten**
Sammlung von Atlanten — kein Besitz, keine Trennung.

## 2. Tech-Stack & Betrieb

| Bereich      | Wahl |
|--------------|------|
| Frontend     | React + TypeScript, Vite, Tailwind, shadcn/ui (UI-Chrome), **React Flow** (Canvas) |
| Graph-Layout | dagre oder ELK (gerichtetes Layout je Orts-Cluster) |
| Backend      | **Go**, `net/http` + Chi-Router, `sqlc` + `go-sql-driver/mysql` |
| API-Stil     | **REST/JSON** (+ ein dedizierter Baum-Endpunkt) |
| DB           | **MariaDB** über den im Cluster vorhandenen **MariaDB-Operator** |
| Auth         | **Keycloak** (im Stack), OIDC, komplette App hinter Login |
| Migrationen  | `golang-migrate`, als Helm-Hook-Job vor App-Start |
| Deployment   | **Ein Umbrella-Helm-Chart**, `helm install` |
| Cluster      | Siemens.cloud (`admin@siemen.cloud` kube-context) |

### Cluster-Befund
- **Kein** PostgreSQL-Operator vorhanden → daher MariaDB.
- Vorhandene Operatoren: **MariaDB-Operator** (genutzt), Percona MySQL, RabbitMQ, Redpanda.
- Eine MariaDB-Instanz (per `MariaDB`-CR), **zwei Datenbanken: `craftverse` + `keycloak`**, geteilt.

## 3. Datenmodell

Eine MariaDB-Datenbank `craftverse`. Skizze (Spalten exemplarisch):

```
atlas
  id            PK
  name          NOT NULL
  description   NULL
  created_at, updated_at

item
  id            PK
  atlas_id      FK -> atlas (ON DELETE CASCADE)
  name          NOT NULL
  notes         TEXT NULL
  created_at, updated_at
  -- Rohstoff = Item ohne recipe

tag
  id            PK
  atlas_id      FK -> atlas
  name          NOT NULL
  color         NULL          -- für Knoten-Färbung
  UNIQUE(atlas_id, name)

item_tag
  item_id       FK -> item (ON DELETE CASCADE)
  tag_id        FK -> tag  (ON DELETE CASCADE)
  PK(item_id, tag_id)

recipe
  id            PK
  atlas_id      FK -> atlas
  output_item_id FK -> item (ON DELETE CASCADE)   -- das hergestellte Item
  is_primary    BOOL          -- markiert den bevorzugten Weg (für Phase-2-Aggregation)
  created_at, updated_at
  -- ein Item kann 0..n Rezepte haben

recipe_ingredient
  id            PK
  recipe_id     FK -> recipe (ON DELETE CASCADE)
  item_id       FK -> item   -- die Zutat (Löschen: siehe Integritäts-Regel)
  quantity      INT NOT NULL DEFAULT 1   -- reine Anzahl, keine Einheit

location
  id            PK
  atlas_id      FK -> atlas
  name          NOT NULL
  UNIQUE(atlas_id, name)

recipe_location           -- n:m: ein Rezept kann an mehreren Orten herstellbar sein (optional)
  recipe_id     FK -> recipe   (ON DELETE CASCADE)
  location_id   FK -> location (ON DELETE CASCADE)
  PK(recipe_id, location_id)
```

**Modell-Entscheidungen & Begründung:**
- **Mehrere Rezepte pro Item** (eigene `recipe`-Tabelle) — der einzige Modus, der nicht später bricht;
  "genau ein Rezept" wäre nur ein Sonderfall.
- **Mengen** als Ganzzahl auf `recipe_ingredient` — essenziell für die spätere Stückliste, kostet fast nichts.
- **Rohstoffe** = Items ohne Rezept (kein eigenes Flag).
- **Ort am Rezept, n:m, optional** — "wo wird's gemacht" gehört zum Herstellungsweg, nicht zum Item;
  verschiedene Rezepte können verschiedene Stationen brauchen.
- **`is_primary`** auf `recipe` — Vorbereitung für Phase-2-Pfadauswahl/Aggregation; in Phase 1 ohne Funktion.
- Tags/Locations sind **atlas-lokal**.

## 4. Verhalten & Flows

### 4.1 Top-Bar + Canvas (einziges Layout)
- **Top-Bar:** links Projektname (Craftverse) + **Atlas-Wechsler-Dropdown mit Suchfunktion**
  ("+ Neuer Atlas" → Mini-Dialog nur Name; Umbenennen/Löschen im selben Menü).
  Rechts User-Nav: Anzeigename aus Keycloak (Vor-/Nachname bzw. Username) + Dropdown mit **Logout**.
- **Darunter:** Vollbild-Canvas. Sonst nichts.
- Zuletzt gewählter Atlas wird in `localStorage` gemerkt (nach Reload sofort wieder aktiv).

### 4.2 Canvas (React Flow)
- Items = Knoten (Name, optional Tag-Farbe), Abhängigkeiten = Kanten (aus den Daten abgeleitet).
- **Auto-Layout**, nach **Herstellungsort geclustert** (Orte als Bereiche/Gruppen), innerhalb dagre/ELK
  gerichtetes Layout für die Crafting-Hierarchie. Keine manuell persistierten Positionen.
- Zoom/Pan/Minimap eingebaut. "Universe"-Optik über Styling (dunkler Hintergrund, sanftes Glühen), nicht 3D.
- **Suche:** Suchfeld fokussiert/hebt Treffer-Knoten hervor (zoom-to).

### 4.3 Editieren — zwei Wege (beide in Phase 1)
1. **Seitenpanel (shadcn Sheet):** Knoten klicken → Panel mit Item-Feldern (Name, Notes, Tags) und Abschnitt
   "Rezepte": Rezept hinzufügen → Zutaten per **Autocomplete** + Menge + Orte (Orte **on-the-fly** anlegbar:
   neuer Name = neuer Ort). Präzise Pflege.
2. **Graph-Interaktion (draw.io-Stil):**
   - **Linie Knoten→Knoten ziehen** = "Quelle ist Zutat von Ziel". Mapping aufs Rezept-Modell:
     - Ziel hat **kein** Rezept → automatisch eins anlegen, Zutat dort rein.
     - Ziel hat **genau ein** Rezept → Zutat dort rein.
     - Ziel hat **mehrere** Rezepte → kurzes Popup "zu welchem Rezept?".
     - Menge default 1, im Mini-Popup/Panel anpassbar.
   - **Linie ins Leere ziehen** → "neues Item anlegen"-Inline-Flow; neues Item wird sofort als Zutat verdrahtet.

### 4.4 Detailseite: rekursiver Crafting-Baum
- Item öffnen → vollständiger, rekursiver Baum bis zu den Rohstoff-Leaves.
- **Mehrere Rezepte** = parallele **ODER-Äste** (man sieht jeden möglichen Weg).
- Mengen werden je Kante angezeigt (Phase 1 zeigt Mengen, **aggregiert aber nicht** über den Baum).
- Backend liefert den Baum als **ein** Endpunkt `GET /items/{id}/tree`, serverseitig rekursiv aufgelöst
  (rekursive CTE in MariaDB ≥10.2 oder Rekursion in Go).
- **Aufbau ist Phase-2-tauglich:** Baum-Knoten so strukturiert, dass später Grün-Markierung/Inventar andocken kann.

## 5. Edge Cases & Integrität

- **Zyklen (A→B→A):** *erlaubt*, kein Backend-Verbot. Der Baum-Renderer trackt besuchte Knoten und stoppt
  an einem Zyklus mit Hinweis "↩ zyklisch". Garantiert endliche Anzeige.
- **Item löschen, das anderswo Zutat ist:** *blockieren* + Verwendungs-Liste anzeigen ("wird verwendet in: Auto, Motor").
  Zusätzlich **"Force Delete"-Option**, die kaskadiert (entfernt die betroffenen `recipe_ingredient`-Einträge mit).
- **Leere Zustände:** noch kein Atlas → Aufforderung "ersten Atlas anlegen". Atlas ohne Items → leerer Canvas mit Hinweis.
- **Rezept ohne Ort / ohne Zutaten:** zulässig (Ort optional; Rezept ohne Zutaten ~ trivialer Herstellungsschritt).
- **Atlas löschen:** kaskadiert über alle zugehörigen Items/Rezepte/Orte/Tags (FK `ON DELETE CASCADE`).

## 6. Auth

- **Keycloak im Stack**, OIDC. **Komplette App hinter Login** — keine öffentliche Leseansicht.
- **Realm-Import-JSON** beim Start: Realm + OIDC-Client (Frontend, Authorization-Code + PKCE) + ein Start-User
  vorkonfiguriert → "nur noch User hinzufügen", nichts manuell verdrahten.
- Frontend hält Tokens (OIDC-Library, z. B. `oidc-client-ts`/`react-oidc-context`); Backend validiert das
  Bearer-JWT gegen Keycloaks JWKS auf jedem API-Call. Anzeigename aus Token-Claims.
- Keine per-User-Autorisierung in Phase 1 (jeder eingeloggte User darf alles).

## 7. API (REST/JSON, Skizze)

```
GET    /atlases                 POST /atlases            PATCH /atlases/{id}    DELETE /atlases/{id}
GET    /atlases/{id}/items      POST /atlases/{id}/items
GET    /items/{id}              PATCH /items/{id}        DELETE /items/{id}?force=true
GET    /items/{id}/tree                                  -- rekursiver Crafting-Baum
POST   /items/{id}/recipes      PATCH /recipes/{id}      DELETE /recipes/{id}
       -- recipe-ingredients & recipe-locations als Sub-Ressourcen oder im Recipe-Body
GET    /atlases/{id}/locations  POST .../locations       (on-the-fly via Name)
GET    /atlases/{id}/tags       POST .../tags
GET    /atlases/{id}/graph                               -- Knoten+Kanten für den Canvas in einem Rutsch
```
- `DELETE /items/{id}` ohne `force` und mit vorhandenen Verwendungen → `409 Conflict` + Verwendungs-Liste im Body.
- `GET /atlases/{id}/graph` liefert alles, was der Canvas zum Rendern + Clustern (nach Ort) braucht.

## 8. Lokale Entwicklung (docker-compose + Traefik)

- **`docker-compose.yml`** im Repo-Root mit **Traefik** als Reverse-Proxy (ein Einstiegspunkt, Host-Routing
  per Labels). Services: `traefik`, `mariadb`, `keycloak`, `backend` (Go), `frontend` (Vite Dev-Server).
- Traefik routet z. B. `craftverse.localhost` → Frontend, `craftverse.localhost/api` → Backend,
  `auth.localhost` → Keycloak. MariaDB nur intern.
- Eine MariaDB mit zwei DBs (`craftverse` + `keycloak`), per Init-SQL angelegt. Keycloak im Dev-Modus mit
  demselben Realm-Import-JSON wie Produktion.
- Hot-Reload: Frontend via Vite, Backend via `air` (oder `go run` bei Bedarf).

## 9. Deployment (GitHub + GitHub Actions → Cluster)

- **Repo:** `git@github.com:siemendev/craftverse.git`, Branch `main`.
- **CI/CD:** GitHub Actions — bei Push auf `main`: Backend- und Frontend-Images bauen, in
  **GitHub Container Registry (ghcr.io)** pushen, dann `helm upgrade --install` in den Cluster.
- **Ziel:** Cluster `admin@siemen.cloud`, **Namespace `craftverse`** (vom Chart angelegt; im Cluster noch nicht vorhanden).
  Kube-Credentials als GitHub-Secret (`KUBE_CONFIG`).
- **Ingress:** Cluster nutzt **Traefik** (`ingressClassName: traefik`) — ein Host, `/api` ans Backend,
  Rest ans Frontend.

### Helm-Chart (Umbrella)
- **Ein Umbrella-Helm-Chart** unter `deploy/helm/craftverse`: Go-App (Deployment + Service + Ingress),
  Frontend (Deployment + Service), Keycloak (Subchart), MariaDB-CRs, Migrations-Job. Eine `values.yaml`, ein `helm install`.
- **MariaDB über den vorhandenen Operator** (`k8s.mariadb.com/v1alpha1`):
  - `MariaDB`-CR (Instanz, `mariadb:10.11`, `storage` via `local-path`, ohne dedizierte nodeSelector/tolerations).
  - `Database`-CRs für `craftverse` und `keycloak`.
  - `User`-/`Grant`-CRs für App- und Keycloak-User. Backups/Failover macht der Operator.
- **Keycloak:** Subchart (Bitnami), gegen die operator-bereitgestellte MariaDB (`KC_DB=mariadb`),
  Realm-Import-JSON aus ConfigMap gemountet.
- **Migrationen:** `golang-migrate` als Helm-Hook-Job (pre-install/pre-upgrade) vor App-Start.
- **Secrets** via k8s `Secret` (DB-Credentials, Keycloak-Client-Secret).

### Cluster-Fakten (verifiziert)
- MariaDB-Operator vorhanden (`k8s.mariadb.com/v1alpha1`: `MariaDB`/`Database`/`User`/`Grant`).
- Ingress-Controller: **Traefik** (`ingressClassName: traefik`).
- StorageClass: `local-path` (default, `WaitForFirstConsumer`).
- Namespace `craftverse` existiert noch nicht → vom Chart/CI angelegt.

## 10. Testing (Standard-Defaults, nicht im Interview vertieft)
- Backend: Go-Unit-Tests für Baum-Auflösung (inkl. Zyklus-Stop) + Lösch-Integrität; Integrationstests gegen MariaDB-Testcontainer.
- Frontend: Komponenten-Tests für Panel-Editing; leichte E2E (Atlas anlegen → Item → Rezept → Baum sehen).

## 11. Offene Punkte (bewusst auf Implementierungszeit verschoben)
- Genaue Tag-Farbgebung/Palette.
- Suchumfang-Details (Name + Tags angenommen).
- Exaktes Clustering-Verhalten, wenn ein Item über mehrere Rezepte an mehreren Orten hängt
  (Heuristik: primärer/erster Ort bestimmt das Cluster).
- Empty-/Error-State-Feinschliff.

## 12. Phase-2-Ausblick (nur Kontext, nicht bauen)
- Pro-User-Inventar: "habe ich / wie viel", Grün-Markierung im Baum, "gecraftet" → Inventar hochzählen.
- Pfad-Auswahl bei Mehrfach-Rezepten + aggregierte Gesamt-Stückliste + Orte-Liste ("was brauche ich, wo muss ich hin").
- Ggf. Medien/Bilder an Items, Tabellen-Ansicht für Massenpflege, Settings, evtl. per-User-Daten/Rollen.
