/**
 * 🧠 Blueprint 1: Daily Mission Control Digest
 * HyperFocusZone / Mission Control Hub
 * 
 * Flow:
 * 07:00 BST → GitHub: fetch open issues + PRs + commits
 *           → Supabase: fetch yesterday's BROski$ activity
 *           → Notion: create daily digest page
 *           → Slack: post digest summary to #mission-control
 * 
 * MCP Tools used:
 * - GitHub: Search Issues and Pull Requests, List Commits, List Workflow Runs
 * - Supabase: Select Row, Count Rows
 * - Notion: Create Page, Append Block to Parent
 * - Slack: Build and Send a Block Kit Message
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  github: {
    repo: "welshDog/WelshDog-Mission-Control",
    owner: "welshDog",
  },
  supabase: {
    table_broski_transactions: "broski_transactions",
    table_users: "users",
    table_agent_logs: "agent_logs",
  },
  notion: {
    parent_page_id: process.env.NOTION_DIGEST_PARENT_ID,
  },
  slack: {
    channel: "#mission-control",
  },
  pipedream: {
    mcp_url: "https://mcp.pipedream.net/v2",
    token: process.env.PIPEDREAM_TOKEN,
  },
};

// ─── MCP Client Setup ─────────────────────────────────────────────────────────
async function createMCPClient() {
  const client = new Client(
    { name: "hyper-digest-agent", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  return client;
}

// ─── Step 1: GitHub Data Fetch ────────────────────────────────────────────────
async function fetchGitHubData(client) {
  console.log("🐙 Step 1: Fetching GitHub data...");

  const [openIssues, openPRs, recentCommits, workflowRuns] = await Promise.all([
    // Open issues
    client.callTool("github", "search_issues_and_pull_requests", {
      query: `repo:${CONFIG.github.repo} is:issue is:open`,
      per_page: 20,
    }),
    // Open PRs
    client.callTool("github", "search_issues_and_pull_requests", {
      query: `repo:${CONFIG.github.repo} is:pr is:open`,
      per_page: 10,
    }),
    // Recent commits (last 24h)
    client.callTool("github", "list_commits", {
      owner: CONFIG.github.owner,
      repo: "WelshDog-Mission-Control",
      since: new Date(Date.now() - 86400000).toISOString(),
      per_page: 20,
    }),
    // Workflow runs
    client.callTool("github", "list_workflow_runs", {
      owner: CONFIG.github.owner,
      repo: "WelshDog-Mission-Control",
      per_page: 5,
    }),
  ]);

  const data = {
    open_issues: openIssues?.total_count ?? 0,
    open_prs: openPRs?.total_count ?? 0,
    issues_list: openIssues?.items?.slice(0, 5) ?? [],
    prs_list: openPRs?.items?.slice(0, 3) ?? [],
    commits_today: recentCommits?.length ?? 0,
    latest_commit: recentCommits?.[0] ?? null,
    last_workflow: workflowRuns?.workflow_runs?.[0] ?? null,
  };

  console.log(`   ✅ Issues: ${data.open_issues} | PRs: ${data.open_prs} | Commits today: ${data.commits_today}`);
  return data;
}

// ─── Step 2: Supabase Data Fetch ──────────────────────────────────────────────
async function fetchSupabaseData(client) {
  console.log("⚡ Step 2: Fetching Supabase data...");

  const yesterday = new Date(Date.now() - 86400000).toISOString();

  const [txCount, newUsers, agentErrors] = await Promise.all([
    // BROski$ transactions yesterday
    client.callTool("supabase", "count_rows", {
      table: CONFIG.supabase.table_broski_transactions,
      filter: `created_at=gte.${yesterday}`,
    }),
    // New users yesterday
    client.callTool("supabase", "count_rows", {
      table: CONFIG.supabase.table_users,
      filter: `created_at=gte.${yesterday}`,
    }),
    // Agent errors yesterday
    client.callTool("supabase", "select_row", {
      table: CONFIG.supabase.table_agent_logs,
      filter: `created_at=gte.${yesterday}&status=eq.error`,
      limit: 5,
    }),
  ]);

  const data = {
    transactions_yesterday: txCount?.count ?? 0,
    new_users_yesterday: newUsers?.count ?? 0,
    agent_errors: agentErrors?.length ?? 0,
    agent_error_list: agentErrors?.slice(0, 3) ?? [],
  };

  console.log(`   ✅ Transactions: ${data.transactions_yesterday} | New users: ${data.new_users_yesterday} | Agent errors: ${data.agent_errors}`);
  return data;
}

// ─── Step 3: Build Digest Content ─────────────────────────────────────────────
function buildDigestContent(github, supabase, date) {
  const dateStr = new Date(date).toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const statusEmoji = (github.open_issues > 10 || supabase.agent_errors > 0) ? "🟡" : "🟢";
  const workflowStatus = github.last_workflow?.conclusion === "success" ? "✅ Passing" : "❌ Failing";

  return {
    title: `🧠 Mission Control Digest — ${dateStr}`,
    status: statusEmoji,
    sections: {
      github: {
        open_issues: github.open_issues,
        open_prs: github.open_prs,
        commits_today: github.commits_today,
        latest_commit_msg: github.latest_commit?.commit?.message ?? "No commits today",
        workflow_status: workflowStatus,
        top_issues: github.issues_list.map(i => `• [#${i.number}] ${i.title}`).join("\n"),
        top_prs: github.prs_list.map(p => `• [#${p.number}] ${p.title}`).join("\n"),
      },
      supabase: {
        transactions: supabase.transactions_yesterday,
        new_users: supabase.new_users_yesterday,
        agent_errors: supabase.agent_errors,
        error_summary: supabase.agent_error_list.map(e => `• ${e.message}`).join("\n") || "None 🎉",
      },
    },
  };
}

// ─── Step 4: Write to Notion ───────────────────────────────────────────────────
async function writeToNotion(client, digest) {
  console.log("📝 Step 4: Writing digest to Notion...");

  // Create the page
  const page = await client.callTool("notion", "create_page", {
    parent: { page_id: CONFIG.notion.parent_page_id },
    properties: {
      title: {
        title: [{ text: { content: digest.title } }],
      },
    },
  });

  const pageId = page?.id;
  if (!pageId) throw new Error("Failed to create Notion page");

  // Append the digest content as blocks
  await client.callTool("notion", "append_block_to_parent", {
    block_id: pageId,
    children: [
      // Status callout
      {
        type: "callout",
        callout: {
          rich_text: [{ text: { content: `Overall Status: ${digest.status === "🟢" ? "All Systems Go" : "Attention Needed"}` } }],
          icon: { emoji: digest.status },
          color: digest.status === "🟢" ? "green_background" : "yellow_background",
        },
      },
      // Divider
      { type: "divider", divider: {} },
      // GitHub section header
      {
        type: "heading_2",
        heading_2: { rich_text: [{ text: { content: "🐙 GitHub Overview" } }] },
      },
      // GitHub stats
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ text: { content: `Open Issues: ${digest.sections.github.open_issues}` } }] },
      },
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ text: { content: `Open PRs: ${digest.sections.github.open_prs}` } }] },
      },
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ text: { content: `Commits Today: ${digest.sections.github.commits_today}` } }] },
      },
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ text: { content: `CI/CD: ${digest.sections.github.workflow_status}` } }] },
      },
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ text: { content: `Latest Commit: ${digest.sections.github.latest_commit_msg}` } }] },
      },
      // Divider
      { type: "divider", divider: {} },
      // Supabase section header
      {
        type: "heading_2",
        heading_2: { rich_text: [{ text: { content: "⚡ BROski Activity" } }] },
      },
      // Supabase stats
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ text: { content: `BROski$ Transactions: ${digest.sections.supabase.transactions}` } }] },
      },
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ text: { content: `New Users: ${digest.sections.supabase.new_users}` } }] },
      },
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ text: { content: `Agent Errors: ${digest.sections.supabase.agent_errors}` } }] },
      },
      // Footer
      { type: "divider", divider: {} },
      {
        type: "paragraph",
        paragraph: {
          rich_text: [{ text: { content: "Generated automatically by BROski Mission Control Agent ♾️" } }],
          color: "gray",
        },
      },
    ],
  });

  console.log(`   ✅ Notion page created: ${pageId}`);
  return pageId;
}

// ─── Step 5: Post to Slack ────────────────────────────────────────────────────
async function postToSlack(client, digest, notionPageId) {
  console.log("💬 Step 5: Posting digest to Slack...");

  const statusColor = digest.status === "🟢" ? "#00c851" : "#ffbb33";
  const notionUrl = `https://notion.so/${notionPageId.replace(/-/g, "")}`;

  await client.callTool("slack", "build_and_send_block_kit_message", {
    channel: CONFIG.slack.channel,
    text: digest.title,
    blocks: [
      // Header
      {
        type: "header",
        text: { type: "plain_text", text: `${digest.status} Mission Control Digest`, emoji: true },
      },
      // Date context
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: digest.title }],
      },
      { type: "divider" },
      // GitHub section
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🐙 GitHub*\n• Open Issues: *${digest.sections.github.open_issues}*\n• Open PRs: *${digest.sections.github.open_prs}*\n• Commits Today: *${digest.sections.github.commits_today}*\n• CI/CD: *${digest.sections.github.workflow_status}*`,
        },
      },
      { type: "divider" },
      // BROski Activity section
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*⚡ BROski Activity*\n• Transactions: *${digest.sections.supabase.transactions}*\n• New Users: *${digest.sections.supabase.new_users}*\n• Agent Errors: *${digest.sections.supabase.agent_errors}*`,
        },
      },
      { type: "divider" },
      // CTA button to Notion
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "📋 View Full Digest in Notion", emoji: true },
            style: "primary",
            url: notionUrl,
          },
        ],
      },
      // Footer
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "Generated by *BROski Mission Control Agent* ♾️ | HyperFocusZone" }],
      },
    ],
  });

  console.
