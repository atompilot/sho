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

type Format string

const (
	FormatMarkdown Format = "markdown"
	FormatHTML     Format = "html"
	FormatTXT      Format = "txt"
	FormatJSX      Format = "jsx"
	FormatAuto     Format = "auto" // sentinel; resolved before persistence
)

type Post struct {
	ID             uuid.UUID  `json:"id"`
	Slug           string     `json:"slug"`
	Title          *string    `json:"title,omitempty"`
	Content        string     `json:"content"`
	Format         Format     `json:"format"`
	Policy         Policy     `json:"policy"`
	Password       *string    `json:"-"`
	AIReviewPrompt *string    `json:"ai_review_prompt,omitempty"`
	EditToken      string     `json:"-"`
	Views          int        `json:"views"`
	Likes          int        `json:"likes"`
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
func ValidFormat(f Format) bool {
	switch f {
	case FormatMarkdown, FormatHTML, FormatTXT, FormatJSX:
		return true
	}
	return false
}

// PublishResponse is returned to the author after creating a post.
type PublishResponse struct {
	ID        uuid.UUID `json:"id"`
	Slug      string    `json:"slug"`
	EditToken string    `json:"edit_token"`
	ManageURL string    `json:"manage_url"`
	CreatedAt time.Time `json:"created_at"`
}
