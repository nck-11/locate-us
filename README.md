# Locate Us

A web app where signed-in people connect with each other and see each other's live location on a map. Sharing is opt-in: each person turns it on, and only connected people can see it.

## What you need
- A free Supabase account (database, sign-in, and live updates)
- VS Code, and Git (for GitHub)

## 1. Create the database
1. In Supabase, create a new project.
2. Go to **SQL Editor > New query**, paste the contents of `supabase/schema.sql`, and click **Run**.
3. Go to **Authentication > Providers** and make sure Email is enabled. For quick testing, turn off **Confirm email** in the Email provider settings.

## 2. Connect the app
1. In Supabase, go to **Project Settings > API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `app.js` and replace `YOUR-PROJECT.supabase.co` and `YOUR-ANON-KEY` with those values.

The anon key is designed to be public. Your data is protected by the security rules in `schema.sql`.

## 3. Run it locally
1. Open the folder in VS Code.
2. Install the **Live Server** extension, right-click `index.html`, and choose **Open with Live Server**.
3. Sign up with two different emails (use two browser windows, or one normal and one private window), connect them, and turn on sharing in both.

Location works on `localhost` without extra setup.

## 4. Put it on GitHub and open it on phones
Phones only give location to HTTPS sites, so host it on GitHub Pages:

```
git init
git add .
git commit -m "Locate Us app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/locate-us.git
git push -u origin main
```

Then on GitHub: **Settings > Pages > Build and deployment > Deploy from a branch > main / (root)**. The site appears at `https://YOUR-USERNAME.github.io/locate-us/`.

## How it works
- **Connect:** enter someone's email. Both accounts are linked, so you see each other.
- **Share:** tap **Start sharing**. The phone or computer sends its position about every 5 seconds. Tap **Stop sharing** to hide it.
- **Map:** markers update in real time. A person disappears from the map after 10 minutes without an update.

## Known limits
- **Phones:** browsers pause location updates when the tab is in the background or the screen is locked. For reliable background tracking, the next step is a native app (Expo/React Native), which can reuse this same Supabase backend.
- **Emails:** any signed-in user can look up profiles, which exposes emails. Before a public launch, replace the profile lookup with a function that only confirms an exact email match.
- **Scale:** each live update is pushed to everyone who can see it. This is fine for small groups; larger use needs a review.
- **Account deletion** isn't built yet.
- The map uses the free OpenStreetMap tile server, which is fine for testing but not for heavy traffic.
