package pool

import "testing"

type testItem struct{ n int }

func TestTakeAndPutRecycles(t *testing.T) {
	p := New(2, func(i *testItem) { i.n = -1 })
	a, ha, ok := p.Take()
	if !ok || a.n != -1 {
		t.Fatalf("first take failed: ok=%v item=%+v", ok, a)
	}
	if _, _, ok := p.Take(); !ok {
		t.Fatal("second take should succeed")
	}
	if _, _, ok := p.Take(); ok {
		t.Fatal("third take should fail on an exhausted pool")
	}
	p.Put(ha)
	if _, _, ok := p.Take(); !ok {
		t.Fatal("take after put should succeed")
	}
}

func TestDoublePutIsIgnored(t *testing.T) {
	p := New(1, func(*testItem) {})
	_, h, _ := p.Take()
	p.Put(h)
	p.Put(h) // must not corrupt the free list
	if got := p.Available(); got != 1 {
		t.Fatalf("double put grew the pool: available=%d want 1", got)
	}
}

func TestEachVisitsOnlyLive(t *testing.T) {
	p := New(3, func(*testItem) {})
	_, h1, _ := p.Take()
	_, _, _ = p.Take()
	p.Put(h1)
	count := 0
	p.Each(func(int, *testItem) { count++ })
	if count != 1 {
		t.Fatalf("Each visited %d items, want 1", count)
	}
}

func TestResetReclaimsAll(t *testing.T) {
	p := New(4, func(*testItem) {})
	for range 4 {
		p.Take()
	}
	p.Reset()
	if p.Live() != 0 || p.Available() != 4 {
		t.Fatalf("reset left live=%d available=%d", p.Live(), p.Available())
	}
}
