// Forums — fully connected to Supabase
import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@clerk/clerk-react";
import { db } from "../supabase.js";
import { BookIcon, UserIcon, CalendarIcon, GraduationCapIcon, LightbulbIcon, BellIcon } from "./icons.jsx";
import { Skeleton, SkeletonForumList, useMinimumLoading } from "./skeletons.jsx";

const CATEGORIES = [
  { Icon: BookIcon,          title: "Course Reviews",        description: "Share your experience with specific courses — workload, exams, what to expect." },
  { Icon: UserIcon,          title: "Professor Experiences", description: "Discuss teaching styles, office hours, and what it's actually like in their class." },
  { Icon: CalendarIcon,      title: "Schedule Planning",     description: "Get advice on course loads, scheduling conflicts, and semester planning." },
  { Icon: GraduationCapIcon, title: "Major & Pathway Advice", description: "Questions about majors, requirements, and degree planning." },
  { Icon: LightbulbIcon,     title: "Study Tips & Resources", description: "Tutoring, study groups, useful websites, and how to survive hard courses." },
  { Icon: BellIcon,          title: "Site Feedback",          description: "Suggestions, bug reports, and ideas for Darvis features." },
];

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── New Post Modal ────────────────────────────────────────────────
function NewPostModal({ onClose, onSubmit, saving, darkMode, defaultCategory = "", currentUser }) {
  const [title,     setTitle]     = useState("");
  const [body,      setBody]      = useState("");
  const [category,  setCategory]  = useState(defaultCategory);
  const [anonymous, setAnonymous] = useState(false);
  const [error,     setError]     = useState("");

  const dm = darkMode;
  const bg     = dm ? "#0f0d14" : "white";
  const border = dm ? "rgba(255,255,255,0.1)"  : "rgba(0,0,0,0.1)";
  const text   = dm ? "rgba(255,255,255,0.88)" : "#1a1210";
  const sub    = dm ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const inputBg     = dm ? "rgba(255,255,255,0.04)" : "white";
  const inputBorder = dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)";

  const inputStyle = {
    width: "100%", padding: "10px 14px", boxSizing: "border-box",
    background: inputBg, border: `1.5px solid ${inputBorder}`,
    borderRadius: 10, color: text, fontSize: 14, fontWeight: 500,
    fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none",
    transition: "border-color 0.15s",
  };

  const submit = () => {
    if (!title.trim()) return setError("Title is required.");
    if (!category)     return setError("Pick a category.");
    if (!body.trim())  return setError("Post body is required.");
    setError("");
    onSubmit({ title: title.trim(), body: body.trim(), category, anonymous });
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: bg, border: `1.5px solid ${border}`,
        borderRadius: 20, width: "100%", maxWidth: 560,
        padding: window.innerWidth < 768 ? "24px 20px 20px" : "36px 36px 32px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        position: "relative",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 16,
          background: "none", border: "none", cursor: "pointer",
          color: sub, fontSize: 22, lineHeight: 1, padding: "4px 6px",
        }}>×</button>

        <h2 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 800, color: text, letterSpacing: "-0.3px" }}>
          New post
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: sub, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7, display: "block" }}>Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{ ...inputStyle, appearance: "none", cursor: "pointer", color: category ? text : sub }}
              onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
              onBlur={e => e.currentTarget.style.borderColor = inputBorder}
            >
              <option value="" disabled>Select a category</option>
              {CATEGORIES.map(c => <option key={c.title} value={c.title} style={{ color: "black", background: "white" }}>{c.title}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: sub, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7, display: "block" }}>Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What's your question or topic?"
              maxLength={120}
              style={inputStyle}
              onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
              onBlur={e => e.currentTarget.style.borderColor = inputBorder}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: sub, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7, display: "block" }}>Body</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Share more detail here…"
              rows={6}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
              onBlur={e => e.currentTarget.style.borderColor = inputBorder}
            />
          </div>
        </div>

        {/* Anonymous toggle */}
        <div style={{
          marginTop: 8,
          padding: "12px 14px",
          background: anonymous
            ? (dm ? "rgba(134,31,65,0.10)" : "rgba(134,31,65,0.06)")
            : (dm ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)"),
          border: `1.5px solid ${anonymous ? "rgba(134,31,65,0.30)" : inputBorder}`,
          borderRadius: 10,
          transition: "all 0.15s",
        }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={anonymous}
              onChange={e => setAnonymous(e.target.checked)}
              style={{ accentColor: "#861F41", width: 15, height: 15, marginTop: 1, flexShrink: 0, cursor: "pointer" }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: anonymous ? "#861F41" : text }}>
                Post anonymously
              </div>
              <div style={{ fontSize: 12, color: sub, marginTop: 2, lineHeight: 1.5 }}>
                {anonymous
                  ? `Your post will show as "Anonymous" instead of @${currentUser?.username || currentUser?.firstName || "you"}.`
                  : "Your username will be shown publicly on this post."}
              </div>
            </div>
          </label>
        </div>

        {error && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#e74c3c" }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              flex: 1, background: "#861F41", color: "white", border: "none",
              borderRadius: 12, padding: "12px 24px",
              fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Posting…" : "Post"}
          </button>
          <button onClick={onClose} style={{
            background: "none", border: `1.5px solid ${border}`,
            color: sub, borderRadius: 12, padding: "11px 20px",
            fontWeight: 600, fontSize: 13, cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Post thread view ──────────────────────────────────────────────
function PostThread({ post, onBack, darkMode, currentUser }) {
  const [replies,        setReplies]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [replyBody,      setReplyBody]      = useState("");
  const [saving,         setSaving]         = useState(false);
  const [confirmPost,      setConfirmPost]    = useState(false);   // two-click confirm for post delete
  const [confirmReply,     setConfirmReply]   = useState(null);    // reply id being confirmed
  const [replyAnonymous,   setReplyAnonymous] = useState(false);
  const showLoading = useMinimumLoading(loading);

  const dm = darkMode;
  const bg     = "transparent";
  const cardBg = dm ? "rgba(255,255,255,0.04)" : "white";
  const border = dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text   = dm ? "rgba(255,255,255,0.88)" : "#1a1210";
  const sub    = dm ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const head   = dm ? "#ffffff" : "#1a1210";
  const inputBg     = dm ? "rgba(255,255,255,0.04)" : "white";
  const inputBorder = dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)";

  const fetchReplies = useCallback(async () => {
    const { data } = await db
      .from("forum_replies")
      .select("*")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });
    setReplies(data || []);
    setLoading(false);
  }, [post.id]);

  useEffect(() => { fetchReplies(); }, [fetchReplies]);

  const submitReply = async () => {
    if (!replyBody.trim() || !currentUser) return;
    setSaving(true);
    const { error } = await db.from("forum_replies").insert({
      post_id:       post.id,
      body:          replyBody.trim(),
      clerk_user_id: currentUser.id,
      username:      replyAnonymous ? "Anonymous" : (currentUser.username || currentUser.firstName || "Anonymous"),
    });
    if (!error) {
      setReplyBody("");
      setReplyAnonymous(false);
      fetchReplies();
    }
    setSaving(false);
  };

  const deletePost = async () => {
    await db.from("forum_posts").delete().eq("id", post.id);
    onBack(); // cascade deletes all replies via Supabase FK
  };

  const deleteReply = async (replyId) => {
    const { error } = await db.from("forum_replies").delete().eq("id", replyId);
    if (!error) {
      setConfirmReply(null);
      fetchReplies();
    }
  };

  const [isMobileThread] = useState(() => window.innerWidth < 768);
  return (
    <div style={{ background: bg, minHeight: "calc(100vh - 60px)", fontFamily: "'Plus Jakarta Sans', sans-serif", paddingBottom: 80 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: isMobileThread ? "24px 16px 0" : "40px 48px 0" }}>

        {/* Back */}
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer",
          color: sub, fontSize: 13, fontWeight: 600,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          padding: "0 0 24px", display: "flex", alignItems: "center", gap: 6,
        }}>
          ← Back to Forums
        </button>

        {/* Post */}
        <div style={{
          background: cardBg, border: `1.5px solid ${border}`,
          borderRadius: 16, padding: "28px 32px", marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#861F41", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>
            {post.category}
          </div>
          <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 800, color: head, letterSpacing: "-0.3px", lineHeight: 1.3 }}>
            {post.title}
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: 15, color: text, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
            {post.body}
          </p>
          <div style={{ fontSize: 12, color: sub, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontWeight: 600 }}>@{post.username}</span>
            <span>{timeAgo(post.created_at)}</span>
            <span>{post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}</span>
            {currentUser?.id === post.clerk_user_id && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                {confirmPost ? (
                  <>
                    <span style={{ color: sub }}>Delete this post?</span>
                    <button onClick={deletePost} style={{ background: "#c0392b", color: "white", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Yes, delete</button>
                    <button onClick={() => setConfirmPost(false)} style={{ background: "none", border: "none", color: sub, fontSize: 12, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmPost(true)} style={{ background: "none", border: "none", color: sub, fontSize: 12, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 0 }}>Delete</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Replies */}
        {showLoading ? (
          <SkeletonForumList darkMode={dm} rows={3} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
            {replies.length === 0 && (
              <div style={{ color: sub, fontSize: 14, textAlign: "center", padding: "24px 0" }}>
                No replies yet. Be the first.
              </div>
            )}
            {replies.map(r => (
              <div key={r.id} style={{
                background: cardBg, border: `1px solid ${border}`,
                borderRadius: 12, padding: "18px 22px",
              }}>
                <p style={{ margin: "0 0 12px", fontSize: 14, color: text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                  {r.body}
                </p>
                <div style={{ fontSize: 12, color: sub, display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>@{r.username}</span>
                  <span>{timeAgo(r.created_at)}</span>
                  {currentUser?.id === r.clerk_user_id && (
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      {confirmReply === r.id ? (
                        <>
                          <span style={{ color: sub }}>Delete?</span>
                          <button onClick={() => deleteReply(r.id)} style={{ background: "#c0392b", color: "white", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Yes</button>
                          <button onClick={() => setConfirmReply(null)} style={{ background: "none", border: "none", color: sub, fontSize: 12, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 0 }}>Cancel</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmReply(r.id)} style={{ background: "none", border: "none", color: sub, fontSize: 12, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 0 }}>Delete</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reply box */}
        {currentUser ? (
          <div style={{
            background: cardBg, border: `1.5px solid ${border}`,
            borderRadius: 14, padding: "20px 24px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: sub, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>
              {replyAnonymous ? "Replying anonymously" : `Reply as @${currentUser.username || currentUser.firstName}`}
            </div>
            <textarea
              value={replyBody}
              onChange={e => setReplyBody(e.target.value)}
              placeholder="Write your reply…"
              rows={4}
              style={{
                width: "100%", padding: "10px 14px", boxSizing: "border-box",
                background: inputBg, border: `1.5px solid ${inputBorder}`,
                borderRadius: 10, color: text, fontSize: 14, fontWeight: 500,
                fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none",
                resize: "vertical", lineHeight: 1.6,
              }}
              onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
              onBlur={e => e.currentTarget.style.borderColor = inputBorder}
            />

            {/* Anonymous toggle for replies */}
            <label style={{
              display: "flex", alignItems: "center", gap: 8,
              marginTop: 10, cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={replyAnonymous}
                onChange={e => setReplyAnonymous(e.target.checked)}
                style={{ accentColor: "#861F41", width: 14, height: 14, cursor: "pointer" }}
              />
              <span style={{ fontSize: 12, color: replyAnonymous ? "#861F41" : sub, fontWeight: 600 }}>
                Post anonymously
              </span>
            </label>

            <button
              onClick={submitReply}
              disabled={saving || !replyBody.trim()}
              style={{
                marginTop: 14, background: "#861F41", color: "white", border: "none",
                borderRadius: 10, padding: "10px 24px",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                opacity: (saving || !replyBody.trim()) ? 0.6 : 1,
              }}
            >
              {saving ? "Posting…" : "Post reply"}
            </button>
          </div>
        ) : (
          <div style={{
            background: cardBg, border: `1px solid ${border}`,
            borderRadius: 14, padding: "20px 24px",
            textAlign: "center", color: sub, fontSize: 14,
          }}>
            Sign in to reply to this post.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Category view ─────────────────────────────────────────────────
function CategoryView({ category, onBack, onOpenPost, onNewPost, darkMode, currentUser }) {
  const [posts,         setPosts]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null); // post id being confirmed
  const showLoading = useMinimumLoading(loading);

  const dm = darkMode;
  const bg     = "transparent";
  const cardBg = dm ? "rgba(255,255,255,0.04)" : "white";
  const cardHov= dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)";
  const border = dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text   = dm ? "rgba(255,255,255,0.88)" : "#1a1210";
  const sub    = dm ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const head   = dm ? "#ffffff" : "#1a1210";

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await db
        .from("forum_posts")
        .select("*")
        .eq("category", category.title)
        .order("created_at", { ascending: false });
      setPosts(data || []);
      setLoading(false);
    })();
  }, [category.title]);

  const handleDeletePost = async (postId, e) => {
    e.stopPropagation();
    const { error } = await db.from("forum_posts").delete().eq("id", postId);
    if (!error) {
      setConfirmDelete(null);
      setPosts(prev => prev.filter(p => p.id !== postId));
    }
  };

  const [isMobileCat] = useState(() => window.innerWidth < 768);
  return (
    <div style={{ background: bg, minHeight: "calc(100vh - 60px)", fontFamily: "'Plus Jakarta Sans', sans-serif", paddingBottom: 80 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: isMobileCat ? "24px 16px 0" : "40px 48px 0" }}>

        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer",
          color: sub, fontSize: 13, fontWeight: 600,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          padding: "0 0 24px", display: "flex", alignItems: "center", gap: 6,
        }}>
          ← All categories
        </button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, gap: 16 }}>
          <div>
            <div style={{ marginBottom: 8, color: sub }}><category.Icon size={22} /></div>
            <h1 style={{
              margin: 0, fontSize: 30, fontWeight: 400,
              fontFamily: "'Instrument Serif', Georgia, serif",
              color: head, letterSpacing: "-0.4px",
            }}>{category.title}</h1>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: sub }}>{category.description}</p>
          </div>
          {currentUser && (
            <button
              onClick={() => onNewPost(category.title)}
              style={{
                background: "#861F41", color: "white", border: "none",
                borderRadius: 9, padding: "10px 18px", fontWeight: 700, fontSize: 13,
                cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0,
              }}
            >
              + New Post
            </button>
          )}
        </div>

        {showLoading ? (
          <SkeletonForumList darkMode={dm} rows={5} />
        ) : posts.length === 0 ? (
          <div style={{
            background: cardBg, border: `1px solid ${border}`,
            borderRadius: 14, padding: "48px 32px", textAlign: "center",
          }}>
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "center", color: sub }}><category.Icon size={28} /></div>
            <div style={{ color: head, fontWeight: 700, marginBottom: 6 }}>No posts yet</div>
            <div style={{ color: sub, fontSize: 14 }}>Be the first to start a discussion in {category.title}.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {posts.map(post => (
              <div
                key={post.id}
                style={{
                  background: cardBg, border: `1px solid ${border}`,
                  borderRadius: 12, padding: "18px 22px",
                  position: "relative",
                }}
              >
                <button
                  onClick={() => onOpenPost(post)}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    textAlign: "left", width: "100%",
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, color: head, lineHeight: 1.4, marginBottom: 8 }}>
                    {post.title}
                  </div>
                  <div style={{ fontSize: 13, color: text, lineHeight: 1.5, marginBottom: 10, opacity: 0.75 }}>
                    {post.body.length > 120 ? post.body.slice(0, 120) + "…" : post.body}
                  </div>
                </button>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: sub, alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>@{post.username}</span>
                  <span>{timeAgo(post.created_at)}</span>
                  <span>{post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}</span>
                  {currentUser?.id === post.clerk_user_id && (
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      {confirmDelete === post.id ? (
                        <>
                          <span style={{ color: sub }}>Delete post?</span>
                          <button onClick={e => handleDeletePost(post.id, e)} style={{ background: "#c0392b", color: "white", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Yes</button>
                          <button onClick={e => { e.stopPropagation(); setConfirmDelete(null); }} style={{ background: "none", border: "none", color: sub, fontSize: 12, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 0 }}>Cancel</button>
                        </>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setConfirmDelete(post.id); }} style={{ background: "none", border: "none", color: sub, fontSize: 12, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 0 }}>Delete</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Forums index ─────────────────────────────────────────────
export default function ForumsPage({ darkMode = true, setPage }) {
  const { user, isSignedIn } = useUser();

  const [view,          setView]         = useState("index"); // "index" | "category" | "post"
  const [activeCategory, setActiveCategory] = useState(null);
  const [activePost,    setActivePost]   = useState(null);
  const [recentPosts,   setRecentPosts]  = useState([]);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [totalPosts,    setTotalPosts]   = useState(0);
  const [loadingIndex,  setLoadingIndex] = useState(true);
  const [showNewPost,   setShowNewPost]  = useState(false);
  const [newPostCategory, setNewPostCategory] = useState("");
  const [saving,        setSaving]       = useState(false);
  const showLoadingIndex = useMinimumLoading(loadingIndex);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const dm = darkMode;
  const bg      = "transparent";
  const cardBg  = dm ? "rgba(255,255,255,0.04)"  : "rgba(0,0,0,0.03)";
  const cardHov = dm ? "rgba(255,255,255,0.07)"  : "rgba(0,0,0,0.06)";
  const border  = dm ? "rgba(255,255,255,0.08)"  : "rgba(0,0,0,0.08)";
  const borHov  = dm ? "rgba(255,255,255,0.15)"  : "rgba(0,0,0,0.16)";
  const text    = dm ? "rgba(255,255,255,0.88)"  : "#1a1210";
  const subtext = dm ? "rgba(255,255,255,0.45)"  : "rgba(0,0,0,0.45)";
  const head    = dm ? "#ffffff"                 : "#1a1210";
  const accent  = "#861F41";
  const ctaBg   = dm ? `${accent}18`             : `${accent}10`;
  const ctaBor  = dm ? `${accent}44`             : `${accent}33`;

  const fetchIndex = useCallback(async () => {
    setLoadingIndex(true);

    const [{ data: recent }, { data: counts }] = await Promise.all([
      db.from("forum_posts").select("*").order("created_at", { ascending: false }).limit(8),
      db.from("forum_posts").select("category"),
    ]);

    setRecentPosts(recent || []);

    const totals = {};
    (counts || []).forEach(r => {
      totals[r.category] = (totals[r.category] || 0) + 1;
    });
    setCategoryCounts(totals);
    setTotalPosts(counts?.length || 0);
    setLoadingIndex(false);
  }, []);

  useEffect(() => { if (view === "index") fetchIndex(); }, [view, fetchIndex]);

  const openNewPost = (defaultCat = "") => {
    if (!isSignedIn) return;
    setNewPostCategory(defaultCat);
    setShowNewPost(true);
  };

  const submitPost = async ({ title, body, category, anonymous }) => {
    if (!user) return;
    setSaving(true);
    const { error } = await db.from("forum_posts").insert({
      title,
      body,
      category,
      clerk_user_id: user.id,
      username: anonymous ? "Anonymous" : (user.username || user.firstName || "Anonymous"),
    });
    setSaving(false);
    if (!error) {
      setShowNewPost(false);
      fetchIndex();
    }
  };

  // ── Views ───────────────────────────────────────────────────────
  if (view === "post" && activePost) {
    return (
      <PostThread
        post={activePost}
        onBack={() => {
          if (activeCategory) setView("category");
          else setView("index");
        }}
        darkMode={darkMode}
        currentUser={isSignedIn ? user : null}
      />
    );
  }

  if (view === "category" && activeCategory) {
    return (
      <>
        <CategoryView
          category={activeCategory}
          onBack={() => setView("index")}
          onOpenPost={post => { setActivePost(post); setView("post"); }}
          onNewPost={cat => openNewPost(cat)}
          darkMode={darkMode}
          currentUser={isSignedIn ? user : null}
        />
        {showNewPost && (
          <NewPostModal
            darkMode={darkMode}
            defaultCategory={newPostCategory}
            saving={saving}
            onClose={() => setShowNewPost(false)}
            onSubmit={submitPost}
            currentUser={isSignedIn ? user : null}
          />
        )}
      </>
    );
  }

  // ── Index view ──────────────────────────────────────────────────
  return (
    <div style={{ background: bg, minHeight: "100vh", color: text, fontFamily: "'Plus Jakarta Sans', sans-serif", paddingBottom: 80, transition: "background 0.3s" }}>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${border}`, padding: isMobile ? "28px 0 24px" : "48px 0 40px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "0 16px" : "0 48px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div>
              <span style={{
                fontSize: 11, fontWeight: 500, letterSpacing: "1.8px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "#861F41", textTransform: "uppercase", display: "block", marginBottom: 10,
              }}>Community</span>
              <h1 style={{
                margin: 0, fontSize: "clamp(34px, 4vw, 46px)", fontWeight: 400,
                fontFamily: "'Instrument Serif', Georgia, serif",
                letterSpacing: "-0.5px", color: head, lineHeight: 1.05,
              }}>The <span style={{ color: "#861F41", fontStyle: "italic" }}>forums.</span></h1>
              <p style={{ margin: "10px 0 0", color: subtext, fontSize: 15 }}>
                Real talk about courses from students who've been there.
              </p>
            </div>
            {isSignedIn && (
              <button
                onClick={() => openNewPost()}
                style={{
                  background: accent, color: "white", border: "none", borderRadius: 9,
                  padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                + New Post
              </button>
            )}
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 32, marginTop: 32 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: head }}>{showLoadingIndex ? <Skeleton darkMode={dm} width={30} height={24} /> : totalPosts}</div>
              <div style={{ fontSize: 12, color: subtext, marginTop: 2 }}>Posts</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: head }}>{CATEGORIES.length}</div>
              <div style={{ fontSize: 12, color: subtext, marginTop: 2 }}>Categories</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: 1100, margin: "0 auto", padding: isMobile ? "24px 16px 0" : "40px 48px 0",
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 340px", gap: isMobile ? 32 : 40, alignItems: "start",
      }}>

        {/* Left: categories */}
        <div>
          <h2 style={{ margin: "0 0 20px", fontSize: 13, fontWeight: 700, color: subtext, letterSpacing: "0.6px", textTransform: "uppercase" }}>
            Categories
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.title}
                onClick={() => { setActiveCategory(cat); setView("category"); }}
                style={{
                  background: cardBg, border: `1px solid ${border}`,
                  borderRadius: 12, padding: "18px 22px",
                  display: "flex", alignItems: "center", gap: 18,
                  cursor: "pointer", textAlign: "left", width: "100%",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = cardHov; e.currentTarget.style.borderColor = borHov; }}
                onMouseLeave={e => { e.currentTarget.style.background = cardBg;  e.currentTarget.style.borderColor = border; }}
              >
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center", color: text }}><cat.Icon size={22} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: text }}>{cat.title}</div>
                  <div style={{ fontSize: 13, color: subtext, marginTop: 3, lineHeight: 1.5 }}>{cat.description}</div>
                </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: head }}>
                    {showLoadingIndex ? <Skeleton darkMode={dm} width={22} height={18} style={{ marginLeft: "auto" }} /> : (categoryCounts[cat.title] || 0)}
                  </div>
                  <div style={{ fontSize: 11, color: subtext }}>posts</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: recent posts + Darvis CTA */}
        <div>
          <h2 style={{ margin: "0 0 20px", fontSize: 13, fontWeight: 700, color: subtext, letterSpacing: "0.6px", textTransform: "uppercase" }}>
            Recent posts
          </h2>

          {showLoadingIndex ? (
            <SkeletonForumList darkMode={dm} rows={4} />
          ) : recentPosts.length === 0 ? (
            <div style={{
              background: cardBg, border: `1px solid ${border}`,
              borderRadius: 12, padding: "32px 20px", textAlign: "center",
              color: subtext, fontSize: 14,
            }}>
              No posts yet. Be the first.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentPosts.map(post => (
                <button
                  key={post.id}
                  onClick={() => { setActivePost(post); setActiveCategory(null); setView("post"); }}
                  style={{
                    background: cardBg, border: `1px solid ${border}`,
                    borderRadius: 10, padding: "14px 16px",
                    textAlign: "left", cursor: "pointer", width: "100%",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = cardHov}
                  onMouseLeave={e => e.currentTarget.style.background = cardBg}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: text, lineHeight: 1.45 }}>{post.title}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: accent, fontWeight: 600 }}>{post.category}</span>
                    <span style={{ fontSize: 11, color: subtext }}>{timeAgo(post.created_at)}</span>
                    <span style={{ fontSize: 11, color: subtext, marginLeft: "auto" }}>{post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Cyrus CTA */}
          <div style={{ marginTop: 24, background: ctaBg, border: `1px solid ${ctaBor}`, borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: head, marginBottom: 6 }}>Looking for grade data?</div>
            <div style={{ fontSize: 13, color: subtext, lineHeight: 1.55, marginBottom: 14 }}>
              Cyrus can pull historical grade distributions for any course or instructor instantly.
            </div>
            <button
              onClick={() => setPage && setPage("chatbot")}
              style={{
                background: accent, color: "white", border: "none",
                borderRadius: 7, padding: "8px 16px", fontWeight: 700, fontSize: 13,
                cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Open Cyrus →
            </button>
          </div>
        </div>
      </div>

      {/* New post modal */}
      {showNewPost && (
        <NewPostModal
          darkMode={darkMode}
          defaultCategory={newPostCategory}
          saving={saving}
          onClose={() => setShowNewPost(false)}
          onSubmit={submitPost}
          currentUser={isSignedIn ? user : null}
        />
      )}
    </div>
  );
}
