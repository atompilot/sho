package policy_test

import (
	"testing"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/atompilot/sho-api/internal/policy"
	"github.com/stretchr/testify/assert"
)

func TestCheckMasterPassword(t *testing.T) {
	assert.True(t, policy.CheckMasterPassword("master123", "master123"))
	assert.False(t, policy.CheckMasterPassword("master123", "wrong"))
	assert.False(t, policy.CheckMasterPassword("", "anything"))
	assert.False(t, policy.CheckMasterPassword("master123", ""))
}

func TestCheckOpen(t *testing.T) {
	err := policy.CheckUpdate(model.PolicyOpen, nil, "")
	assert.NoError(t, err)
}

func TestCheckPassword_Correct(t *testing.T) {
	hash, err := policy.HashPassword("secret123")
	assert.NoError(t, err)
	err = policy.CheckUpdate(model.PolicyPassword, &hash, "secret123")
	assert.NoError(t, err)
}

func TestCheckPassword_Wrong(t *testing.T) {
	hash, err := policy.HashPassword("secret123")
	assert.NoError(t, err)
	err = policy.CheckUpdate(model.PolicyPassword, &hash, "wrongpass")
	assert.ErrorIs(t, err, policy.ErrInvalidCredential)
}

func TestCheckOwnerOnly_Correct(t *testing.T) {
	token := "my-edit-token"
	err := policy.CheckUpdate(model.PolicyOwnerOnly, &token, "my-edit-token")
	assert.NoError(t, err)
}

func TestCheckOwnerOnly_Wrong(t *testing.T) {
	token := "my-edit-token"
	err := policy.CheckUpdate(model.PolicyOwnerOnly, &token, "wrong-token")
	assert.ErrorIs(t, err, policy.ErrInvalidCredential)
}

func TestGenerateToken_Length(t *testing.T) {
	token, err := policy.GenerateToken(32)
	assert.NoError(t, err)
	assert.Len(t, token, 32)
}

func TestGenerateToken_Unique(t *testing.T) {
	t1, _ := policy.GenerateToken(16)
	t2, _ := policy.GenerateToken(16)
	assert.NotEqual(t, t1, t2)
}
