# YouTube Roulette

Application web multijoueur temps réel pour soirée / anniversaire.

Le principe:

- chaque joueur se connecte avec Google
- l’application tente d’importer ses likes YouTube
- un hôte crée une room privée et invite les autres avec un code
- la partie se joue en 10 manches synchronisées en temps réel
- à chaque manche, tout le monde doit deviner quel joueur a liké la vidéo affichée
- score en direct, reveal, classement final et podium

## Stack

- Frontend: Next.js 14, React, TypeScript, Tailwind CSS
- Auth: NextAuth.js + Google OAuth
- Backend web: Route Handlers Next.js
- Temps réel: serveur Node.js/Express + Socket.IO
- Base de données: PostgreSQL + Prisma ORM
- Partage métier: package TypeScript `@youtube-roulette/shared`
- Déploiement recommandé:
- `apps/web` sur Vercel
- `apps/realtime` sur Railway / Render / Fly.io
- PostgreSQL hébergé sur Neon / Supabase / Railway

## Artefacts de production ajoutés

Le repo inclut maintenant aussi:

- `apps/web/Dockerfile`: image production du frontend Next.js en mode standalone
- `apps/realtime/Dockerfile`: image production du serveur Socket.IO
- `Dockerfile.migrate`: image one-shot pour `prisma generate`, `db push` et seed
- `docker-compose.yml`: stack locale complète avec PostgreSQL
- `.env.docker.example`: variables d'environnement adaptées à Docker Compose
- `.github/workflows/ci.yml`: CI de build GitHub Actions
- `vercel.json`: configuration racine pour déployer le frontend depuis le monorepo
- `railway.toml`: configuration racine pour déployer le service realtime avec Dockerfile
- `.nvmrc`: version Node recommandée

## Architecture

Le projet est organisé en monorepo npm workspaces:

```text
.
├── apps
│   ├── realtime
│   │   ├── src
│   │   │   ├── env.ts
│   │   │   ├── index.ts
│   │   │   └── room-state.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web
│       ├── src
│       │   ├── app
│       │   │   ├── api
│       │   │   │   ├── auth/[...nextauth]/route.ts
│       │   │   │   ├── game/[gameId]/summary/route.ts
│       │   │   │   ├── realtime/token/route.ts
│       │   │   │   └── rooms/...
│       │   │   ├── game/[gameId]/page.tsx
│       │   │   ├── login/page.tsx
│       │   │   ├── results/[gameId]/page.tsx
│       │   │   ├── room/[code]/page.tsx
│       │   │   ├── rooms/page.tsx
│       │   │   ├── globals.css
│       │   │   └── layout.tsx
│       │   ├── components
│       │   │   ├── game/game-client.tsx
│       │   │   ├── home/sign-in-button.tsx
│       │   │   ├── layout/site-header.tsx
│       │   │   ├── providers/app-providers.tsx
│       │   │   ├── results/results-client.tsx
│       │   │   ├── room/create-join-room-panel.tsx
│       │   │   ├── room/room-client.tsx
│       │   │   └── ui/...
│       │   ├── lib
│       │   │   ├── auth.ts
│       │   │   ├── db.ts
│       │   │   ├── env.ts
│       │   │   ├── realtime-token.ts
│       │   │   ├── room-state.ts
│       │   │   ├── rooms.ts
│       │   │   ├── socket.ts
│       │   │   ├── utils.ts
│       │   │   └── youtube.ts
│       │   └── types/next-auth.d.ts
│       ├── middleware.ts
│       ├── next.config.mjs
│       ├── package.json
│       ├── tailwind.config.ts
│       └── tsconfig.json
├── packages
│   └── shared
│       ├── src
│       │   ├── constants.ts
│       │   ├── game.ts
│       │   ├── index.ts
│       │   ├── schemas.ts
│       │   └── types.ts
│       ├── package.json
│       └── tsconfig.json
├── prisma
│   ├── schema.prisma
│   └── seed.ts
├── .env.example
├── package.json
├── README.md
└── tsconfig.base.json
```

## Choix techniques

### Pourquoi 2 apps

Vercel n’est pas idéal pour garder des connexions WebSocket persistantes. Le découpage choisi permet:

- `apps/web`: SSR, auth, pages, API métier, sécurité, UI
- `apps/realtime`: Socket.IO persistant, timers de manches, orchestration du jeu

### Pourquoi un package partagé

Le frontend, l’API et le serveur temps réel partagent:

- les types publics de room / game / round
- les constantes métier
- la validation Zod
- les helpers de deck et de scoring

Ça évite les contrats cassés entre front et back.

## Fonctionnalités incluses

- Google OAuth via NextAuth
- scope YouTube read pour tenter l’import des likes
- fallback manuel de vidéos si les likes sont insuffisants ou indisponibles
- création de room privée avec code court
- lobby temps réel
- prêt / pas prêt
- rôle hôte
- minimum 2 joueurs
- 10 manches par défaut
- timer par manche
- réponses synchronisées
- bonus de rapidité pour la meilleure bonne réponse
- reveal automatique
- scores live
- page résultats + podium
- historique des parties côté base via `Game`, `Round`, `ScoreSnapshot`, `Answer`
- déconnexion / reconnexion gérées
- transfert automatique d’hôte si nécessaire

## Modèle de données Prisma

Entités principales:

- `User`, `Account`, `Session`, `VerificationToken`: auth NextAuth
- `Room`: salon privé, code, hôte, statut, settings
- `RoomPlayer`: présence d’un joueur dans une room, ready state, connexion, score courant
- `VideoEntry`: vidéos utilisables pour une room, issues des likes ou du fallback manuel
- `Game`: instance d’une partie dans une room
- `Round`: une manche et sa vidéo
- `Answer`: réponse d’un joueur sur une manche
- `ScoreSnapshot`: snapshot de classement à la fin de chaque manche

## Variables d’environnement

Le fichier racine `.env.example` contient toutes les variables nécessaires.

Pour Docker Compose, utiliser `.env.docker.example` comme base.

Exemples fournis:

- `.env.development.example`
- `.env.preview.example`
- `.env.production.example`
- `.env.docker.example`

Variables principales:

- `DATABASE_URL`: connexion PostgreSQL
- `DIRECT_DATABASE_URL`: connexion PostgreSQL directe pour les commandes Prisma CLI et les migrations
- `NEXTAUTH_URL`: URL publique du frontend Next.js
- `NEXTAUTH_SECRET`: secret NextAuth
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `REALTIME_JWT_SECRET`: secret partagé entre web et serveur Socket.IO
- `REDIS_URL`: Redis optionnel pour l'adapter Socket.IO en multi-instance
- `LOG_LEVEL`: niveau de logs `debug`, `info`, `warn`, `error`
- `SENTRY_DSN`: DSN serveur pour web + realtime
- `NEXT_PUBLIC_SENTRY_DSN`: DSN navigateur pour le frontend
- `SENTRY_ENVIRONMENT`: `development`, `preview`, `production`
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`: sourcemaps Sentry côté build
- `NEXT_PUBLIC_REALTIME_SERVER_URL`: URL publique du serveur temps réel
- `CLIENT_URL`: URL publique du frontend autorisée en CORS côté realtime
- `PORT`: port du serveur temps réel

## Installation locale

### 1. Prérequis

- Node.js 20+
- npm 10+
- PostgreSQL 15+ local ou distant

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer l’environnement

Copier `.env.example` vers `.env` et compléter les vraies valeurs.

### 4. Générer Prisma et préparer la base

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

En développement, le seed crée une room de démonstration `BDAY24`.

### 5. Lancer le projet

```bash
npm run dev
```

Services:

- web: [http://localhost:3000](http://localhost:3000)
- realtime: [http://localhost:4000](http://localhost:4000)

## Lancement avec Docker

### 1. Préparer l'environnement Docker

Copier `.env.docker.example` vers `.env.docker` puis compléter:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `REALTIME_JWT_SECRET`

La valeur `DATABASE_URL` de `.env.docker` pointe déjà vers le service PostgreSQL interne `db`.

### 2. Démarrer la stack

```bash
npm run docker:up
```

Services démarrés:

- PostgreSQL: `localhost:5432`
- realtime: `http://localhost:4000`
- web: `http://localhost:3000`

Le service `migrate` exécute automatiquement:

- `prisma generate`
- `prisma db push`
- `prisma db seed`

### 3. Arrêter la stack

```bash
npm run docker:down
```

### 4. Consulter les logs

```bash
npm run docker:logs
```

## Configuration Google OAuth

### 1. Créer un projet Google Cloud

- aller dans Google Cloud Console
- créer un projet
- activer l’API YouTube Data v3
- configurer l’écran de consentement OAuth

### 2. Créer un client OAuth Web

Ajouter:

- Authorized JavaScript origins:
  - `http://localhost:3000`
  - votre domaine de prod, par ex. `https://youtube-roulette.vercel.app`
- Authorized redirect URIs:
  - `http://localhost:3000/api/auth/callback/google`
  - `https://votre-domaine/api/auth/callback/google`

### 3. Scopes demandés

Le provider Google demande notamment:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/youtube.readonly`

## Notes sur l’import des likes YouTube

Le mode principal du projet repose sur l’import OAuth des likes YouTube.

En pratique, selon le compte, les politiques Google, le consentement, les quotas, ou des changements d’API, cet accès peut être capricieux. C’est pour cela que le projet inclut un fallback propre:

- import manuel de vidéos YouTube
- conservation des métadonnées nécessaires au jeu
- possibilité d’atteindre le minimum requis sans casser la partie

Le lobby empêche un joueur d’être “ready” s’il n’a pas encore assez de vidéos valides.

## Déploiement recommandé

### Option recommandée

- `apps/web` sur Vercel
- `apps/realtime` sur Railway
- PostgreSQL sur Neon

## Guide ultra concret: Vercel + Railway + Neon

### Vue d'ensemble

Le split recommandé est:

1. Neon héberge PostgreSQL
2. Railway héberge le serveur `apps/realtime`
3. Vercel héberge `apps/web`
4. Vercel pointe vers Railway pour le realtime
5. web et realtime pointent tous les deux vers Neon

### 1. Créer la base sur Neon

Dans Neon:

1. créer un projet `youtube-roulette-prod`
2. créer une base `youtube_roulette`
3. récupérer deux chaînes de connexion:

- URL poolée
- URL directe

Valeurs recommandées à remplir:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler.neon.tech/youtube_roulette?sslmode=require&channel_binding=require&pgbouncer=true&connect_timeout=15
DIRECT_DATABASE_URL=postgresql://USER:PASSWORD@HOST.neon.tech/youtube_roulette?sslmode=require&channel_binding=require
```

Utilisation:

- `DATABASE_URL`: runtime web + realtime
- `DIRECT_DATABASE_URL`: commandes Prisma CLI, en particulier les migrations

### 2. Déployer le realtime sur Railway

Dans Railway:

1. créer un nouveau projet depuis le repo GitHub
2. créer un service à partir du repo
3. laisser Railway utiliser `railway.toml`
4. vérifier que le Dockerfile utilisé est `apps/realtime/Dockerfile`
5. générer un domaine public Railway

Variables Railway à définir:

```env
DATABASE_URL=<la valeur DATABASE_URL Neon poolée>
DIRECT_DATABASE_URL=<la valeur DIRECT_DATABASE_URL Neon directe>
REALTIME_JWT_SECRET=<32+ chars random>
CLIENT_URL=https://your-frontend-domain.vercel.app
PORT=4000
LOG_LEVEL=info
REDIS_URL=<optionnel, vide si mono-instance>
SENTRY_DSN=<optionnel>
SENTRY_ENVIRONMENT=production
```

Valeurs exactes à mettre:

- `CLIENT_URL`: exactement le domaine Vercel final, par ex. `https://youtube-roulette.vercel.app`
- `PORT`: `4000`
- `REALTIME_JWT_SECRET`: même valeur que sur Vercel
- `REDIS_URL`: laisser vide pour une première mise en ligne simple

Test attendu après déploiement:

- `https://your-realtime-domain.up.railway.app/health` doit répondre `{"ok":true,...}`

### 3. Déployer le frontend sur Vercel

Dans Vercel:

1. importer le repo GitHub
2. garder la racine du repo
3. laisser Vercel détecter Next.js
4. conserver `vercel.json`
5. définir les variables d'environnement

Variables Vercel à définir:

```env
DATABASE_URL=<la valeur DATABASE_URL Neon poolée>
DIRECT_DATABASE_URL=<la valeur DIRECT_DATABASE_URL Neon directe>
NEXTAUTH_URL=https://your-frontend-domain.vercel.app
NEXTAUTH_SECRET=<32+ chars random>
GOOGLE_CLIENT_ID=<Google OAuth client id>
GOOGLE_CLIENT_SECRET=<Google OAuth secret>
REALTIME_JWT_SECRET=<la meme valeur que Railway>
NEXT_PUBLIC_APP_URL=https://your-frontend-domain.vercel.app
NEXT_PUBLIC_REALTIME_SERVER_URL=https://your-realtime-domain.up.railway.app
LOG_LEVEL=info
SENTRY_DSN=<optionnel>
NEXT_PUBLIC_SENTRY_DSN=<optionnel>
SENTRY_ENVIRONMENT=production
SENTRY_ORG=<optionnel>
SENTRY_PROJECT=<optionnel>
SENTRY_AUTH_TOKEN=<optionnel>
```

Valeurs exactes à mettre:

- `NEXTAUTH_URL`: le domaine Vercel final exact
- `NEXT_PUBLIC_APP_URL`: le même domaine Vercel
- `NEXT_PUBLIC_REALTIME_SERVER_URL`: le domaine Railway public exact
- `REALTIME_JWT_SECRET`: exactement la même valeur que sur Railway
- `DATABASE_URL` et `DIRECT_DATABASE_URL`: les URLs Neon

### 4. Configurer Google OAuth pour la prod

Dans Google Cloud Console:

Origins autorisés:

- `https://your-frontend-domain.vercel.app`

Redirect URIs autorisées:

- `https://your-frontend-domain.vercel.app/api/auth/callback/google`

Si tu gardes aussi du local:

- `http://localhost:3000`
- `http://localhost:3000/api/auth/callback/google`

### 5. Ordre recommandé de mise en ligne

1. créer Neon
2. configurer Vercel et Railway avec les variables
3. exécuter les migrations prod
4. déployer Railway
5. déployer Vercel
6. configurer Google OAuth avec le vrai domaine Vercel
7. refaire un test d'auth complet

## Workflow Prisma versionné pour la prod

Le repo contient désormais:

- `prisma/migrations/migration_lock.toml`
- `prisma/migrations/20260416180000_init/migration.sql`
- `.github/workflows/migrate-production.yml`

La stratégie recommandée est:

### En local

Quand tu modifies `prisma/schema.prisma`:

```bash
npm run db:migrate -- --name add_room_settings
```

Puis:

```bash
npm run db:generate
npm run build
```

Committer systématiquement:

- les changements du schéma Prisma
- le dossier `prisma/migrations/...`
- le `migration_lock.toml` si nécessaire

### En production

Ne jamais utiliser `prisma db push`.

Utiliser:

```bash
npm run db:migrate:deploy
```

Ce repo contient aussi un workflow GitHub manuel:

- `.github/workflows/migrate-production.yml`

Il lit:

- `secrets.PRODUCTION_DATABASE_URL`
- `secrets.PRODUCTION_DIRECT_DATABASE_URL`

et exécute:

- `npm ci`
- `npm run db:generate`
- `npm run db:migrate:deploy`

### Variables Prisma recommandées avec Neon

Runtime:

- `DATABASE_URL`: URL poolée

CLI / migrations:

- `DIRECT_DATABASE_URL`: URL directe

## Production hardening

### Logs structurés

Le projet utilise maintenant `pino`:

- web: `apps/web/src/lib/logger.ts`
- realtime: `apps/realtime/src/logger.ts`

Exemples de réglage:

- `LOG_LEVEL=debug` en dev
- `LOG_LEVEL=info` en prod

### Sentry

Le projet inclut maintenant:

- `apps/web/src/instrumentation.ts`
- `apps/web/src/instrumentation-client.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/sentry.edge.config.ts`
- `apps/web/src/app/global-error.tsx`
- `apps/realtime/src/observability.ts`

Variables utiles:

- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

Tu peux commencer avec seulement:

```env
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ENVIRONMENT=production
```

Puis ajouter l'upload de sourcemaps plus tard avec:

- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

### Redis adapter Socket.IO

Le serveur realtime active automatiquement l'adapter Redis si `REDIS_URL` est défini.

Cas simple:

- laisser `REDIS_URL` vide
- une seule instance Railway

Cas scale-out:

- définir `REDIS_URL`
- garder à l'esprit que la logique de timers reste plus simple à opérer en mono-instance, même si les transitions critiques ont été rendues plus idempotentes

### Idempotence côté jeu

Le serveur temps réel évite maintenant plus proprement:

- double reveal de manche
- double start de manche suivante
- double lancement de partie
- double réponse joueur

## Séparation des environnements

Fichiers d'exemple fournis:

- `.env.development.example`
- `.env.preview.example`
- `.env.production.example`
- `.env.docker.example`

Recommandation:

- local: `.env`
- preview: variables Vercel/Railway preview
- production: variables Vercel/Railway production

Minimum à garder cohérent entre Vercel et Railway:

- `REALTIME_JWT_SECRET`
- `SENTRY_ENVIRONMENT`
- `LOG_LEVEL`

### Déploiement `apps/web`

Configurer le projet Vercel avec:

- Repository Root: racine du repo
- Framework: Next.js
- `vercel.json` est déjà fourni à la racine

Variables minimales côté Vercel:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `REALTIME_JWT_SECRET`
- `NEXT_PUBLIC_REALTIME_SERVER_URL`

Flux recommandé:

1. créer un projet Vercel pointant sur ce repo
2. laisser l'installation se faire avec `npm ci`
3. laisser le build se faire avec `npm run build --workspace @youtube-roulette/web`
4. définir toutes les variables d'environnement dans le dashboard Vercel

Note:

- le frontend est conçu pour être déployé séparément du serveur Socket.IO
- `NEXT_PUBLIC_REALTIME_SERVER_URL` doit pointer vers le domaine public du service realtime

### Déploiement `apps/realtime`

Configurer le service avec:

- Repository Root: racine du repo
- Builder: Dockerfile
- `railway.toml` est déjà fourni à la racine et pointe sur `apps/realtime/Dockerfile`

Variables minimales côté realtime:

- `DATABASE_URL`
- `REALTIME_JWT_SECRET`
- `CLIENT_URL`
- `PORT`

Flux recommandé:

1. créer un service Railway depuis le repo
2. laisser Railway utiliser `railway.toml`
3. définir les variables d'environnement du service
4. utiliser le domaine public Railway du service realtime dans `NEXT_PUBLIC_REALTIME_SERVER_URL` côté Vercel

Note:

- le healthcheck `/health` est déjà exposé
- le runtime Socket.IO reste sur une instance unique pour cette première version

### Base PostgreSQL

Après avoir branché la DB distante:

```bash
npm run db:generate
npm run db:push
```

Si vous voulez des migrations versionnées ensuite:

```bash
npm run db:migrate
```

## Flux temps réel

1. le joueur rejoint la room via le frontend
2. le frontend demande un jeton court `/api/realtime/token`
3. le client ouvre Socket.IO avec ce jeton
4. le serveur realtime vérifie le JWT et rattache le socket à la room
5. les événements de jeu synchronisent:
   - présence
   - ready state
   - lancement
   - réponses
   - reveal
   - score
   - fin de partie

## Sécurité

- secrets uniquement côté serveur
- routes sensibles protégées par session NextAuth
- validation Zod sur les entrées importantes
- vérification d’appartenance à la room
- vérification du rôle d’hôte pour lancer la partie
- empêchement des doubles réponses via contrainte unique Prisma
- jeton JWT signé pour le realtime

## Limites actuelles connues

- le serveur temps réel est prévu pour une instance unique
- pour du scale horizontal, ajouter Redis adapter + stratégie de timers distribués
- le fallback manuel demande encore la saisie des métadonnées de vidéo
- l’embed YouTube dépend des restrictions de la vidéo source

## Pistes bonus à ajouter ensuite

- paramètres de room modifiables depuis l’UI
- sons de bonne / mauvaise réponse
- écran de transition animé entre les manches
- mini page admin / debug
- historique des parties par utilisateur
- revalidation périodique des imports YouTube

## Scripts utiles

```bash
npm run dev
npm run dev:web
npm run dev:realtime
npm run build
npm run docker:up
npm run docker:down
npm run docker:logs
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:migrate:deploy
npm run db:seed
```

## CI

Le workflow GitHub Actions `.github/workflows/ci.yml` exécute:

- `npm ci`
- `npm run db:generate`
- `npm run build`

Le job utilise des variables d'environnement factices suffisantes pour vérifier le build du monorepo sans exposer de secrets.

## Conseils de production

- générer des secrets longs et distincts
- n’exposer que `NEXT_PUBLIC_*` côté client
- activer HTTPS partout
- limiter CORS du serveur realtime à votre domaine frontend
- surveiller les quotas Google / YouTube
- mettre un Sentry ou équivalent sur web + realtime
