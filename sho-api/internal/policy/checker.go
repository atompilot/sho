package policy

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"

	"github.com/atompilot/sho-api/internal/model"
	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidCredential = errors.New("invalid credential")

// CheckUpdate validates whether an update is permitted.
// For ai-review policy, validation is handled by the service layer (LLM call).
func CheckUpdate(p model.Policy, stored *string, credential string) error {
	switch p {
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
		if stored == nil {
			return ErrInvalidCredential
		}
		if subtle.ConstantTimeCompare([]byte(*stored), []byte(credential)) != 1 {
			return ErrInvalidCredential
		}
		return nil
	case model.PolicyAIReview:
		// ai-review handled upstream by the service layer
		return nil
	default:
		return fmt.Errorf("unknown policy: %s", p)
	}
}

// CheckMasterPassword checks if the given credential matches the master password.
// Returns false if masterPW is empty (feature disabled).
func CheckMasterPassword(masterPW, credential string) bool {
	if masterPW == "" || credential == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(masterPW), []byte(credential)) == 1
}

// ConstantTimeEqual compares two strings in constant time to prevent timing attacks.
func ConstantTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
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
