package model

import (
	"time"

	"github.com/google/uuid"
)

type Policy string

const (
	PolicyLocked    Policy = "locked"
	PolicyOpen      Policy = "open"
	PolicyPassword  Policy = "password"
	PolicyOwnerOnly Policy = "owner-only"
	PolicyAIReview  Policy = "ai-review"
)

type ViewPolicy string

const (
	ViewPolicyOpen     ViewPolicy = "open"
	ViewPolicyPassword ViewPolicy = "password"
	ViewPolicyHumanQA  ViewPolicy = "human-qa"
	ViewPolicyAIQA     ViewPolicy = "ai-qa"
)

func ValidViewPolicy(vp ViewPolicy) bool {
	switch vp {
	case ViewPolicyOpen, ViewPolicyPassword, ViewPolicyHumanQA, ViewPolicyAIQA:
		return true
	}
	return false
}

type Format string

const (
	FormatMarkdown Format = "markdown"
	FormatHTML     Format = "html"
	FormatTXT      Format = "txt"
	FormatJSX      Format = "jsx"
	FormatSVG      Format = "svg"
	FormatCSV      Format = "csv"
	FormatJSON     Format = "json"
	FormatLottie   Format = "lottie"
	FormatP5       Format = "p5"
	FormatReveal   Format = "reveal"
	FormatGLSL     Format = "glsl"
	FormatAuto     Format = "auto" // sentinel; resolved before persistence
)

type Post struct {
	ID             uuid.UUID  `json:"id"`
	Slug           string     `json:"slug"`
	Title          *string    `json:"title,omitempty"`
	AITitle        *string    `json:"ai_title,omitempty"`
	Content        string     `json:"content"`
	Format         Format     `json:"format"`
	Policy         Policy     `json:"policy"`
	Password       *string    `json:"-"`
	AIReviewPrompt *string    `json:"ai_review_prompt,omitempty"`
	ViewPolicy     ViewPolicy `json:"view_policy"`
	ViewPassword   *string    `json:"-"`
	ViewQAQuestion *string    `json:"view_qa_question,omitempty"`
	ViewQAAnswer   *string    `json:"-"`
	Unlisted       bool       `json:"unlisted"`
	EditToken      string     `json:"-"`
	ContentLength  int        `json:"content_length"`
	VersionCount   int        `json:"version_count"`
	Views          int        `json:"views"`
	Likes          int        `json:"likes"`
	LastViewedAt   *time.Time `json:"last_viewed_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	DeletedAt      *time.Time `json:"-"`
}

type Comment struct {
	ID        uuid.UUID  `json:"id"`
	PostID    uuid.UUID  `json:"post_id"`
	ParentID  *uuid.UUID `json:"parent_id"`
	Content   string     `json:"content"`
	CreatedAt time.Time  `json:"created_at"`
}

type PostVersion struct {
	ID        uuid.UUID `json:"id"`
	PostID    uuid.UUID `json:"post_id"`
	Content   string    `json:"content"`
	EditedBy  *string   `json:"edited_by,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// ValidPolicy reports whether p is a known policy value.
func ValidPolicy(p Policy) bool {
	switch p {
	case PolicyLocked, PolicyOpen, PolicyPassword, PolicyOwnerOnly, PolicyAIReview:
		return true
	}
	return false
}

// ValidFormat reports whether f is a known format value.
// Note: FormatTXT is no longer accepted for new posts; existing data is migrated to markdown.
func ValidFormat(f Format) bool {
	switch f {
	case FormatMarkdown, FormatHTML, FormatJSX,
		FormatSVG, FormatCSV, FormatJSON, FormatLottie, FormatP5, FormatReveal, FormatGLSL:
		return true
	}
	return false
}

// PublishResponse is returned to the author after creating a post.
type PublishResponse struct {
	ID           uuid.UUID `json:"id"`
	Slug         string    `json:"slug"`
	EditToken    string    `json:"edit_token"`
	ManageURL    string    `json:"manage_url"`
	EditPassword *string   `json:"edit_password,omitempty"`
	ViewPassword *string   `json:"view_password,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}
