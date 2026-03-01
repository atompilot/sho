#!/usr/bin/env bash
# Sho API Integration Tests
# Tests all REST endpoints using sample files from tests/

set +e  # don't exit on errors; we track failures manually

BASE="http://localhost:15080/api/v1"
PASS=0
FAIL=0
SLUGS=()    # track created slugs for cleanup
TOKENS=()   # track edit tokens

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    green "  PASS: $label (HTTP $actual)"
    ((PASS++))
  else
    red "  FAIL: $label — expected HTTP $expected, got HTTP $actual"
    ((FAIL++))
  fi
}

assert_json() {
  local label="$1" jq_expr="$2" expected="$3" body="$4"
  local actual
  actual=$(echo "$body" | jq -r "$jq_expr" 2>/dev/null || echo "JQ_ERROR")
  if [ "$actual" = "$expected" ]; then
    green "  PASS: $label ($jq_expr = $expected)"
    ((PASS++))
  else
    red "  FAIL: $label — $jq_expr expected '$expected', got '$actual'"
    ((FAIL++))
  fi
}

assert_json_not_empty() {
  local label="$1" jq_expr="$2" body="$3"
  local actual
  actual=$(echo "$body" | jq -r "$jq_expr" 2>/dev/null || echo "")
  if [ -n "$actual" ] && [ "$actual" != "null" ] && [ "$actual" != "" ]; then
    green "  PASS: $label ($jq_expr is non-empty: ${actual:0:40}...)"
    ((PASS++))
  else
    red "  FAIL: $label — $jq_expr is empty or null"
    ((FAIL++))
  fi
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUN_ID="test-$(date +%s)-$$"

# ============================================================
cyan "=== 1. Auto-Format Detection Tests ==="
# ============================================================

declare -A FORMAT_FILES
FORMAT_FILES[markdown]="$SCRIPT_DIR/sample.md"
FORMAT_FILES[jsx]="$SCRIPT_DIR/sample.jsx"
FORMAT_FILES[html]="$SCRIPT_DIR/sample.html"
FORMAT_FILES[csv]="$SCRIPT_DIR/sample.csv"
FORMAT_FILES[json]="$SCRIPT_DIR/sample.json"
FORMAT_FILES[p5]="$SCRIPT_DIR/sample.p5.js"
FORMAT_FILES[glsl]="$SCRIPT_DIR/sample.glsl"
FORMAT_FILES[lottie]="$SCRIPT_DIR/sample.lottie.json"
FORMAT_FILES[svg]="$SCRIPT_DIR/sample.svg"

for expected_fmt in markdown jsx html csv json p5 glsl lottie svg; do
  file="${FORMAT_FILES[$expected_fmt]}"
  content=$(cat "$file")
  # Append unique comment/marker to avoid duplicate detection
  case "$expected_fmt" in
    markdown) content="$content"$'\n'"<!-- $RUN_ID -->" ;;
    html)     content="$content"$'\n'"<!-- $RUN_ID -->" ;;
    jsx)      content="$content"$'\n'"// $RUN_ID" ;;
    csv)      content="$content"$'\n'"_test_run,$(date +%s),unique,entry,$RUN_ID" ;;
    json)     content=$(echo "$content" | jq --arg rid "$RUN_ID" '. + {_test_run: $rid}') ;;
    p5)       content="$content"$'\n'"// $RUN_ID" ;;
    glsl)     content="$content"$'\n'"// $RUN_ID" ;;
    lottie)   content=$(echo "$content" | jq --arg rid "$RUN_ID" '. + {_test_run: $rid}') ;;
    svg)      content="$content"$'\n'"<!-- $RUN_ID -->" ;;
  esac

  # Build JSON payload with jq to handle escaping
  payload=$(jq -n --arg c "$content" '{ content: $c, format: "auto", policy: "owner-only" }')

  resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
    -H "Content-Type: application/json" \
    -d "$payload")

  status=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')

  assert_status "Create $expected_fmt post" "201" "$status"

  if [ "$status" = "201" ]; then
    slug=$(echo "$body" | jq -r '.slug')
    token=$(echo "$body" | jq -r '.edit_token')
    SLUGS+=("$slug")
    TOKENS+=("$token")

    # Verify format detection
    get_resp=$(curl -s "$BASE/posts/$slug")
    detected=$(echo "$get_resp" | jq -r '.format')
    assert_json "Detect format: $expected_fmt" '.format' "$expected_fmt" "$get_resp"
  fi
done

# ============================================================
cyan ""
cyan "=== 2. CRUD Operations ==="
# ============================================================

# 2a. Create with explicit format + title
cyan "--- 2a. Create with explicit format and title ---"
payload=$(jq -n --arg c "# Explicit Test\nHello world $RUN_ID" '{ content: $c, format: "markdown", title: "My Title", policy: "owner-only" }')
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" \
  -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Create with explicit format" "201" "$status"
CRUD_SLUG=$(echo "$body" | jq -r '.slug')
CRUD_TOKEN=$(echo "$body" | jq -r '.edit_token')
SLUGS+=("$CRUD_SLUG")
TOKENS+=("$CRUD_TOKEN")

# 2b. Get the post
cyan "--- 2b. Get post ---"
resp=$(curl -s -w "\n%{http_code}" "$BASE/posts/$CRUD_SLUG")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Get post" "200" "$status"
assert_json "Title preserved" '.title' "My Title" "$body"
assert_json "Format is markdown" '.format' "markdown" "$body"
assert_json_not_empty "Content exists" '.content' "$body"

# 2c. Update the post
cyan "--- 2c. Update post ---"
payload=$(jq -n --arg t "$CRUD_TOKEN" '{ content: "# Updated\nNew content here", credential: $t }')
resp=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/posts/$CRUD_SLUG" \
  -H "Content-Type: application/json" \
  -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Update post" "200" "$status"
assert_json "Update status" '.status' "updated" "$body"

# Verify update — check content starts with expected text (avoid literal \n comparison)
get_resp=$(curl -s "$BASE/posts/$CRUD_SLUG")
updated_content=$(echo "$get_resp" | jq -r '.content')
if echo "$updated_content" | grep -q "# Updated"; then
  green "  PASS: Content updated (contains '# Updated')"
  ((PASS++))
else
  red "  FAIL: Content not updated — got: ${updated_content:0:60}"
  ((FAIL++))
fi

# 2d. Get 404
cyan "--- 2d. Get non-existent post ---"
resp=$(curl -s -w "\n%{http_code}" "$BASE/posts/nonexistent-slug-xyz")
status=$(echo "$resp" | tail -1)
assert_status "Get non-existent post" "404" "$status"

# 2e. Delete post
cyan "--- 2e. Delete post ---"
resp=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE/posts/$CRUD_SLUG?token=$CRUD_TOKEN")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Delete post" "200" "$status"
assert_json "Delete status" '.status' "deleted" "$body"

# Verify deleted
resp=$(curl -s -w "\n%{http_code}" "$BASE/posts/$CRUD_SLUG")
status=$(echo "$resp" | tail -1)
assert_status "Get deleted post returns 404" "404" "$status"

# ============================================================
cyan ""
cyan "=== 3. Edit Policies ==="
# ============================================================

# 3a. locked policy — update should fail
cyan "--- 3a. Locked policy ---"
payload=$(jq -n --arg c "Locked post $RUN_ID" '{ content: $c, policy: "locked" }')
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Create locked post" "201" "$status"
LOCKED_SLUG=$(echo "$body" | jq -r '.slug')
LOCKED_TOKEN=$(echo "$body" | jq -r '.edit_token')
SLUGS+=("$LOCKED_SLUG")
TOKENS+=("$LOCKED_TOKEN")

payload=$(jq -n --arg t "$LOCKED_TOKEN" '{ content: "Try update", credential: $t }')
resp=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/posts/$LOCKED_SLUG" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
assert_status "Update locked post fails" "403" "$status"

# 3b. password policy — update with wrong password
cyan "--- 3b. Password policy ---"
payload=$(jq -n --arg c "Password post $RUN_ID" '{ content: $c, policy: "password", password: "secret123" }')
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Create password post" "201" "$status"
PWD_SLUG=$(echo "$body" | jq -r '.slug')
PWD_TOKEN=$(echo "$body" | jq -r '.edit_token')
SLUGS+=("$PWD_SLUG")
TOKENS+=("$PWD_TOKEN")

# Wrong password
payload=$(jq -n '{ content: "Wrong pwd update", credential: "wrong" }')
resp=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/posts/$PWD_SLUG" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
assert_status "Update with wrong password fails" "401" "$status"

# Correct password
payload=$(jq -n '{ content: "Correct pwd update", credential: "secret123" }')
resp=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/posts/$PWD_SLUG" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
assert_status "Update with correct password succeeds" "200" "$status"

# 3c. open policy — anyone can update
cyan "--- 3c. Open policy ---"
payload=$(jq -n --arg c "Open post $RUN_ID" '{ content: $c, policy: "open" }')
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Create open post" "201" "$status"
OPEN_SLUG=$(echo "$body" | jq -r '.slug')
OPEN_TOKEN=$(echo "$body" | jq -r '.edit_token')
SLUGS+=("$OPEN_SLUG")
TOKENS+=("$OPEN_TOKEN")

payload=$(jq -n '{ content: "Anyone can edit", credential: "anything" }')
resp=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/posts/$OPEN_SLUG" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
assert_status "Update open post succeeds" "200" "$status"

# 3d. owner-only — wrong token fails
cyan "--- 3d. Owner-only policy ---"
payload=$(jq -n --arg c "Owner only post $RUN_ID" '{ content: $c, policy: "owner-only" }')
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Create owner-only post" "201" "$status"
OWN_SLUG=$(echo "$body" | jq -r '.slug')
OWN_TOKEN=$(echo "$body" | jq -r '.edit_token')
SLUGS+=("$OWN_SLUG")
TOKENS+=("$OWN_TOKEN")

payload=$(jq -n '{ content: "Wrong token", credential: "badtoken" }')
resp=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/posts/$OWN_SLUG" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
assert_status "Update owner-only with wrong token fails" "401" "$status"

payload=$(jq -n --arg t "$OWN_TOKEN" '{ content: "Right token", credential: $t }')
resp=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/posts/$OWN_SLUG" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
assert_status "Update owner-only with correct token succeeds" "200" "$status"

# ============================================================
cyan ""
cyan "=== 4. View Policies ==="
# ============================================================

# 4a. password view policy
cyan "--- 4a. Password view policy ---"
payload=$(jq -n --arg c "Secret stuff $RUN_ID" '{ content: $c, view_policy: "password", view_password: "viewpw123" }')
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Create view-password post" "201" "$status"
VP_SLUG=$(echo "$body" | jq -r '.slug')
VP_TOKEN=$(echo "$body" | jq -r '.edit_token')
SLUGS+=("$VP_SLUG")
TOKENS+=("$VP_TOKEN")

# GET should return preview, not full content
get_resp=$(curl -s "$BASE/posts/$VP_SLUG")
has_preview=$(echo "$get_resp" | jq 'has("preview")')
has_full_content=$(echo "$get_resp" | jq 'has("content")')
assert_json "View-password returns preview" 'has("preview")' "true" "$get_resp"

# Verify-view with wrong password
payload='{"credential":"wrong"}'
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/$VP_SLUG/verify-view" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_json "Wrong view password denied" '.granted' "false" "$body"

# Verify-view with correct password
payload='{"credential":"viewpw123"}'
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/$VP_SLUG/verify-view" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_json "Correct view password granted" '.granted' "true" "$body"
assert_json_not_empty "Full content returned" '.content' "$body"

# 4b. human-qa view policy
cyan "--- 4b. Human-QA view policy ---"
payload=$(jq -n --arg c "QA protected content $RUN_ID" '{ content: $c, view_policy: "human-qa", view_qa_question: "What is 2+2?", view_qa_answer: "4" }')
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Create human-qa post" "201" "$status"
QA_SLUG=$(echo "$body" | jq -r '.slug')
QA_TOKEN=$(echo "$body" | jq -r '.edit_token')
SLUGS+=("$QA_SLUG")
TOKENS+=("$QA_TOKEN")

# GET returns question
get_resp=$(curl -s "$BASE/posts/$QA_SLUG")
assert_json_not_empty "QA question returned" '.view_qa_question' "$get_resp"

# Wrong answer
payload='{"credential":"5"}'
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/$QA_SLUG/verify-view" \
  -H "Content-Type: application/json" -d "$payload")
body=$(echo "$resp" | sed '$d')
assert_json "Wrong QA answer denied" '.granted' "false" "$body"

# Correct answer
payload='{"credential":"4"}'
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/$QA_SLUG/verify-view" \
  -H "Content-Type: application/json" -d "$payload")
body=$(echo "$resp" | sed '$d')
assert_json "Correct QA answer granted" '.granted' "true" "$body"

# 4c. Missing required fields for human-qa
cyan "--- 4c. Human-QA missing answer ---"
payload=$(jq -n --arg c "Missing answer $RUN_ID" '{ content: $c, view_policy: "human-qa", view_qa_question: "What?" }')
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
assert_status "Human-QA without answer returns 400" "400" "$status"

# ============================================================
cyan ""
cyan "=== 5. Social Features ==="
# ============================================================

# Use one of the format-test posts
SOCIAL_SLUG="${SLUGS[0]}"

# 5a. Record view
cyan "--- 5a. Record view ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/$SOCIAL_SLUG/view")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Record view" "200" "$status"
assert_json_not_empty "Views count returned" '.views' "$body"

# 5b. Like post
cyan "--- 5b. Like post ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/$SOCIAL_SLUG/like")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Like post" "200" "$status"
assert_json_not_empty "Likes count returned" '.likes' "$body"

# Like again — should be already_liked
resp=$(curl -s "$BASE/posts/$SOCIAL_SLUG/like" -X POST)
assert_json "Duplicate like detected" '.already_liked' "true" "$resp"

# 5c. Comments
cyan "--- 5c. Comments ---"
payload='{"content":"Great post!"}'
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/$SOCIAL_SLUG/comments" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Create comment" "201" "$status"
COMMENT_ID=$(echo "$body" | jq -r '.id')
assert_json_not_empty "Comment ID returned" '.id' "$body"

# Reply to comment
payload=$(jq -n --arg pid "$COMMENT_ID" '{ content: "Thanks!", parent_id: $pid }')
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/$SOCIAL_SLUG/comments" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Reply to comment" "201" "$status"
assert_json "Reply has parent_id" '.parent_id' "$COMMENT_ID" "$body"

# List comments
resp=$(curl -s -w "\n%{http_code}" "$BASE/posts/$SOCIAL_SLUG/comments")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "List comments" "200" "$status"
count=$(echo "$body" | jq 'length')
if [ "$count" -ge 2 ]; then
  green "  PASS: Comment count >= 2 (got $count)"
  ((PASS++))
else
  red "  FAIL: Expected >= 2 comments, got $count"
  ((FAIL++))
fi

# 5d. Version history
cyan "--- 5d. Version history ---"
# Update the post first to create a version
payload=$(jq -n --arg t "${TOKENS[0]}" '{ content: "Updated for version test", credential: $t }')
curl -s -X PUT "$BASE/posts/$SOCIAL_SLUG" \
  -H "Content-Type: application/json" -d "$payload" > /dev/null

resp=$(curl -s -w "\n%{http_code}" "$BASE/posts/$SOCIAL_SLUG/versions")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "List versions" "200" "$status"
total=$(echo "$body" | jq '.total')
if [ "$total" -ge 1 ]; then
  green "  PASS: Version count >= 1 (got $total)"
  ((PASS++))
else
  red "  FAIL: Expected >= 1 version, got $total"
  ((FAIL++))
fi

# ============================================================
cyan ""
cyan "=== 6. List, Search, Recommended ==="
# ============================================================

# 6a. List posts
cyan "--- 6a. List posts ---"
resp=$(curl -s -w "\n%{http_code}" "$BASE/posts?limit=5")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "List posts" "200" "$status"
list_count=$(echo "$body" | jq 'length')
if [ "$list_count" -ge 1 ]; then
  green "  PASS: List has posts (got $list_count)"
  ((PASS++))
else
  red "  FAIL: List is empty"
  ((FAIL++))
fi

# 6b. List with format filter
cyan "--- 6b. List with format filter ---"
resp=$(curl -s -w "\n%{http_code}" "$BASE/posts?limit=5&format=markdown")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "List markdown posts" "200" "$status"
# Verify all results are markdown
all_md=$(echo "$body" | jq '[.[] | .format] | all(. == "markdown")')
assert_json "All results are markdown" '[.[] | .format] | all(. == "markdown")' "true" "$body"

# 6c. Search
cyan "--- 6c. Search posts ---"
resp=$(curl -s -w "\n%{http_code}" "$BASE/posts/search?q=Sample")
status=$(echo "$resp" | tail -1)
assert_status "Search posts" "200" "$status"

# 6d. Recommended
cyan "--- 6d. Recommended posts ---"
resp=$(curl -s -w "\n%{http_code}" "$BASE/posts/recommended?limit=10")
status=$(echo "$resp" | tail -1)
assert_status "Recommended posts" "200" "$status"

# ============================================================
cyan ""
cyan "=== 7. Edge Cases ==="
# ============================================================

# 7a. Empty content
cyan "--- 7a. Empty content ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d '{"content":""}')
status=$(echo "$resp" | tail -1)
assert_status "Empty content returns 400" "400" "$status"

# 7b. No content field
cyan "--- 7b. Missing content field ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d '{"format":"markdown"}')
status=$(echo "$resp" | tail -1)
assert_status "Missing content returns 400" "400" "$status"

# 7c. Duplicate content
cyan "--- 7c. Duplicate content ---"
dup_content="Unique test content for dup check $RUN_ID"
payload=$(jq -n --arg c "$dup_content" '{ content: $c }')
curl -s -X POST "$BASE/posts" -H "Content-Type: application/json" -d "$payload" > /dev/null
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Duplicate content returns 409" "409" "$status"
assert_json "Duplicate error type" '.error' "duplicate_content" "$body"

# 7d. Delete with wrong token
cyan "--- 7d. Delete with wrong token ---"
resp=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE/posts/${SLUGS[1]}?token=wrongtoken")
status=$(echo "$resp" | tail -1)
assert_status "Delete with wrong token returns 401" "401" "$status"

# 7e. Delete without token
cyan "--- 7e. Delete without token ---"
resp=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE/posts/${SLUGS[1]}")
status=$(echo "$resp" | tail -1)
assert_status "Delete without token returns 401" "401" "$status"

# 7f. Invalid format
cyan "--- 7f. Invalid format ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d '{"content":"test","format":"invalid_format"}')
status=$(echo "$resp" | tail -1)
assert_status "Invalid format returns 400" "400" "$status"

# 7g. Invalid policy
cyan "--- 7g. Invalid policy ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d '{"content":"test","policy":"invalid_policy"}')
status=$(echo "$resp" | tail -1)
assert_status "Invalid policy returns 400" "400" "$status"

# 7h. Invalid view_policy
cyan "--- 7h. Invalid view_policy ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d '{"content":"test","view_policy":"invalid"}')
status=$(echo "$resp" | tail -1)
assert_status "Invalid view_policy returns 400" "400" "$status"

# 7i. View non-existent post
cyan "--- 7i. View non-existent post ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/nonexistent999/view")
status=$(echo "$resp" | tail -1)
assert_status "View non-existent post returns 404" "404" "$status"

# 7j. Like non-existent post
cyan "--- 7j. Like non-existent post ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/nonexistent999/like")
status=$(echo "$resp" | tail -1)
assert_status "Like non-existent post returns 404" "404" "$status"

# 7k. Comment on non-existent post
cyan "--- 7k. Comment on non-existent post ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/nonexistent999/comments" \
  -H "Content-Type: application/json" -d '{"content":"hello"}')
status=$(echo "$resp" | tail -1)
assert_status "Comment on non-existent post returns 404" "404" "$status"

# 7l. Empty comment
cyan "--- 7l. Empty comment ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/${SLUGS[0]}/comments" \
  -H "Content-Type: application/json" -d '{"content":""}')
status=$(echo "$resp" | tail -1)
assert_status "Empty comment returns 400" "400" "$status"

# 7m. Verify-view on open post
cyan "--- 7m. Verify-view on open post ---"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts/${SLUGS[0]}/verify-view" \
  -H "Content-Type: application/json" -d '{"credential":"anything"}')
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Verify-view on open post" "200" "$status"
assert_json "Open post always granted" '.granted' "true" "$body"

# 7n. auto-generate password
cyan "--- 7n. Auto-generate password ---"
payload=$(jq -n --arg c "Auto password test $RUN_ID" '{ content: $c, policy: "password" }')
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/posts" \
  -H "Content-Type: application/json" -d "$payload")
status=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "Create with auto-generated password" "201" "$status"
edit_pwd=$(echo "$body" | jq -r '.edit_password')
if [ ${#edit_pwd} -eq 6 ]; then
  green "  PASS: Auto-generated password is 6 digits ($edit_pwd)"
  ((PASS++))
else
  red "  FAIL: Expected 6-digit password, got '$edit_pwd' (len=${#edit_pwd})"
  ((FAIL++))
fi
AUTO_SLUG=$(echo "$body" | jq -r '.slug')
AUTO_TOKEN=$(echo "$body" | jq -r '.edit_token')
SLUGS+=("$AUTO_SLUG")
TOKENS+=("$AUTO_TOKEN")

# ============================================================
cyan ""
cyan "=== 8. Cleanup ==="
# ============================================================

cleaned=0
for i in "${!SLUGS[@]}"; do
  slug="${SLUGS[$i]}"
  token="${TOKENS[$i]}"
  if [ -n "$token" ] && [ "$token" != "null" ]; then
    curl -s -X DELETE "$BASE/posts/$slug?token=$token" > /dev/null 2>&1 && ((cleaned++)) || true
  fi
done
# Also clean up the duplicate test post
curl -s "$BASE/posts?limit=100" | jq -r '.[].slug' | while read -r s; do
  # We can't delete without token, so just leave them
  :
done
green "Cleaned up $cleaned test posts"

# ============================================================
cyan ""
cyan "========================================="
cyan "  Results: $PASS passed, $FAIL failed"
cyan "========================================="
# ============================================================

exit $FAIL
