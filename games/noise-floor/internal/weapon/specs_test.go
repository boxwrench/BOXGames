package weapon

import "testing"

func TestPrecisionEscalationMatchesTuning(t *testing.T) {
	// Values from the Task 9a brief -- pinned so a later edit is a
	// deliberate, visible change, not a silent drift.
	got := PrecisionEscalation
	want := Spec{
		Name:     "Precision Escalation",
		Cooldown: 0.5,
		Damage:   3,
		Speed:    16,
		Range:    9,
	}
	if got != want {
		t.Fatalf("PrecisionEscalation = %+v, want %+v", got, want)
	}
}
