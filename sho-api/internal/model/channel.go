package model

import (
	"time"

	"github.com/google/uuid"
)

type Channel struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	DisplayName *string   `json:"display_name,omitempty"`
	Description *string   `json:"description,omitempty"`
	AgentID     *string   `json:"agent_id,omitempty"`
	EditToken   string    `json:"-"`
	CreatedAt   time.Time `json:"created_at"`
}
