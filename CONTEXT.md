# TPT Portal

A search front end over Arctos specimen data. Its reason to exist is pairwise
Relationship search — "which X are hosts of Y" — which Arctos's own site does not do
well. Arctos owns the data and its vocabulary; this glossary records the terms this
portal uses and where they deliberately differ.

## Language

**Specimen**:
A single Arctos cataloged item. "Record" is an accepted synonym in prose where the
context is clear. Parts of a cataloged item are not modelled here.

**Attribute**:
A recorded fact about a specimen — a type, optional values, and whether the search
negates it. There is one kind of Attribute. "Detection attributes" and "other
attributes" are a presentation split only; they carry no separate rules.
_Avoid_: Detection (as a distinct concept), property, trait

**Collector**:
The Arctos Agent in the collector role. This portal searches no other agent role.
_Avoid_: Agent

**Relationship**:
A link between a specimen and another organism, always stated as **the searched
specimen's own side of the link**. "Parasite of" finds the parasites; "host of
parasite" finds their hosts. A Relationship always qualifies a Taxon — it is never
searched on its own. Arctos serves relations for every discipline it holds; this
portal offers only the biotic subset.
_Avoid_: Relation

**Taxon**:
A named rank in the taxonomic hierarchy that a specimen is identified as. Always free
text — a name absent from the Snapshot is still a legitimate search. Autocomplete
signals to the user whether a name is likely to match the data.

**Related taxon**:
The other party in a pairwise Relationship search — the Y in "which X are hosts of Y".
Distinct from the Taxon being searched for, which is the X. A Taxon may name several
Related taxa, which match if any one of them does. Carries a rank and free
text, exactly like a Taxon. All other filters constrain the searched specimen only: a
parasite was collected in its host's collecting event whatever place the determination
was later made in. Filtering on the related taxon's own Attributes — "hosts of ticks
where the tick tested positive" — is deliberately out of scope.

**Recorded, not observed**:
Every Attribute reflects what someone wrote down, over decades, to best-effort
standards. Records may carry a detection with no matching examination, or the reverse,
or contradict themselves. Consequently `NOT "not detected"` and `"detected"` are
genuinely different searches and both must stay expressible; negations of negative
attribute types are meaningful, not redundant.

**Rank**:
A level in the taxonomic hierarchy. The schema's rank list also carries
`scientific_name`, which is not a rank but a whole-name match; it is offered in the
same dropdown deliberately.

**Collection**:
An Arctos collection, identified by its GUID prefix. The unit a specimen is held by
and the unit this portal filters on — an institution holding several collections
appears as several Collections.
_Avoid_: Institution

**Method**:
How a detection was determined. Qualifies Attributes and is never searched on its
own; recorded as prose, so matching it is approximate.

**Snapshot**:
The dated extract of Arctos that this portal searches. Counts shown beside filter
options are counts within the Snapshot, never counts of the current results.
