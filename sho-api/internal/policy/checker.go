package policy

import (
	"crypto/rand"
	"encoding/base64"
	"errors"

	"github.com/atompilot/sho-api/internal/model"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrLocked            = errors.New("content is locked and cannot be modified")
	ErrInvalidCredential = errors.New("invalid credential")
)

// CheckUpdate validates whether an update is permitted.
// For ai-review policy, validation is handled by the service layer (LLM call).
func CheckUpdate(p model.Policy, stored *string, credential string) error {
	switch p {
	case model.PolicyLocked:
		return ErrLocked
	case model.PolicyOpen:
		return nil
	case model.PolicyPassword:
		if stored == nil {
			return ErrInvalidCredential
		}
		if err := bcrypt.CompareHashAndPassword([]byte(*stored), []byte(credential)); err != nil {
			return ErrInvalidCredential
		}
		return nil
	case model.PolicyOwnerOnly:
		if stored == nil || *stored != credential {
			return ErrInvalidCredential
		}
		return nil
	default:
		// ai-review handled upstream
		return nil
	}
}

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func GenerateToken(n int) (string, error) {
	// Generate enough random bytes to produce n base64url characters
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	encoded := base64.URLEncoding.EncodeToString(b)
	return encoded[:n], nil
}
