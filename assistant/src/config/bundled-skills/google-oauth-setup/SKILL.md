---
name: google-oauth-setup
description: Set up Google OAuth credentials to connect Google Calendar, Gmail, and Google Drive
compatibility: "Designed for Vellum personal assistants"
metadata:
  emoji: "🔑"
  vellum:
    category: "settings"
    display-name: "Google OAuth Setup"
---

You are helping your user set up Google OAuth credentials. These credentials allow the assistant to act on behalf of the user in Google Calendar, Gmail, and Google Drive.

The user can choose between two paths:
- **Path A (Manual)**: The user creates the project and credentials in the Google Cloud Console manually.
- **Path B (Automatic)**: The assistant uses a browser to create the project and credentials for the user.

# Setup Steps

## Step 0: Choose Setup Path

Ask the user if they want you to set it up automatically (Path B) or if they want to do it manually (Path A).

> I can set up your Google OAuth credentials automatically using a browser window, or I can walk you through the manual steps in the Google Cloud Console. Which would you prefer?

## Path B: Automatic Setup (Recommended)

1. Tell the user you're starting a browser window to create the Google Cloud project.
2. Use the `google_oauth_setup_start` tool.

> I'm opening a browser window now to set up your Google Cloud project. You'll see it on the right side of your screen. Please follow any prompts in that window.

## Path A: Manual Setup

If the user chooses manual setup, provide these concise instructions:

1. **Create Project**: Go to [Google Cloud Console](https://console.cloud.google.com/), create a new project, and name it "Vellum Assistant".
2. **Enable APIs**: Enable the Google Calendar API, Gmail API, and Google Drive API.
3. **Configure OAuth Consent Screen**: Set user type to **External**, enter an email, and add the scopes for Calendar, Gmail, and Drive.
4. **Create Credentials**: Create an **OAuth 2.0 Client ID** (type: Web Application).
5. **Add Redirect URI**: Add `https://assistant.vellum.ai/v1/oauth/callback` as an authorized redirect URI.
6. **Collect Credentials**: Copy the **Client ID** and **Client Secret** and enter them into the secure prompts below.

# Reporting Success

Once credentials are collected and validated:

```
Setup complete!
✅ Google Cloud project created
✅ APIs enabled (Calendar, Gmail, Drive)
✅ OAuth Credentials stored

You can now use Google Calendar, Gmail, and Google Drive tools.
```
