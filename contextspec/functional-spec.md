# Functional Specification

> Per-story Gherkin Acceptance Criteria.
> Appended automatically by bolt after human approval.

## Epic 354312: Teste

### Story 9218128: Create New Empty Playlist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 13:10 UTC

```gherkin
Feature: Create New Empty Playlist

  Scenario: User successfully creates a new playlist
    Given the user is in the playlists section
    When the user clicks the 'Create Playlist' button
    And a form appears asking for a playlist name and optional description
    And the user enters 'Summer Road Trip' as the name
    And the user enters 'Feel-good tracks for long drives' as the description
    And the user clicks 'Create'
    Then the playlist is created
    And the user is taken to the empty playlist view
    And the user can begin adding albums or tracks

  Scenario: User attempts to create a playlist with no name
    Given the user is on the create playlist form
    When the user leaves the name field empty
    And the user fills in a description
    And the user clicks 'Create'
    Then an error message appears indicating that a playlist name is required
    And the form remains open
    And the user can enter a name and try again

  Scenario: User creates a playlist with only a name
    Given the user is on the create playlist form
    When the user enters 'Late Night Jazz' as the name
    And the user leaves the description blank
    And the user clicks 'Create'
    Then the playlist is successfully created with just the name
    And the user can add content immediately
```

### Story 9218129: Add Albums to Playlist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 13:10 UTC

```gherkin
Feature: Add Albums to Playlist

  Scenario: User adds an album they have logged to their playlist
    Given the user has an existing playlist open
    And the user has previously logged 'Rumours' by Fleetwood Mac on LinerNotes
    When the user clicks 'Add Album'
    And a search interface appears
    And the user searches for 'Rumours' by Fleetwood Mac
    And the user clicks the album in the search results
    Then the album is added to the playlist
    And the album appears in the playlist with its cover art and title

  Scenario: User adds multiple albums to a playlist in sequence
    Given the user is building a 'Breakup Anthems' playlist
    When the user adds 'Rumours'
    And the user clicks 'Add Album' again and adds 'Blue' by Joni Mitchell
    And the user clicks 'Add Album' again and adds 'Jagged Little Pill' by Alanis Morissette
    Then all three albums appear in the playlist
    And the albums are in the order they were added

  Scenario: User searches for an album that does not exist in the catalog
    Given the user has opened their playlist
    And the user clicks 'Add Album'
    When the user searches for an obscure bootleg album not in the LinerNotes catalog
    Then the search returns no results
    And a message appears saying 'No albums found. Try a different search.'
    And the user can modify their search or cancel

  Scenario: User attempts to add the same album twice to a playlist
    Given the user's playlist already contains 'Rumours'
    When the user searches for 'Rumours' again
    And the user clicks to add it
    Then a message appears indicating 'This album is already in your playlist'
    And the album is not duplicated
    And the user can dismiss the message and continue
```

### Story 9218130: Arrange Albums in Playlist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 13:10 UTC

```gherkin
Feature: Arrange Albums in Playlist

  Scenario: User reorders albums by dragging and dropping
    Given the user has a playlist with three albums: 'Rumours', 'Blue', and 'Jagged Little Pill' in that order
    When the user clicks and drags 'Blue' to the top of the list
    Then the order updates to 'Blue', 'Rumours', 'Jagged Little Pill'

  Scenario: User moves an album to the bottom of the playlist
    Given the user has a five-album playlist with 'Rumours' in the middle
    When the user drags 'Rumours' to the bottom
    Then the other albums shift up
    And 'Rumours' now appears last in the list

  Scenario: User attempts to reorder on a single-album playlist
    Given the user has a playlist with only one album
    When the user views the playlist
    Then there is no drag-and-drop interface available
    And the album is displayed without reordering controls
```

### Story 9218131: Remove Albums from Playlist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 13:10 UTC

```gherkin
Feature: Remove Albums from Playlist

  Scenario: User removes an album from their playlist
    Given the user's playlist contains four albums
    When the user hovers over 'Jagged Little Pill'
    And a delete icon appears
    And the user clicks it
    And a confirmation dialog asks 'Remove this album from the playlist?'
    And the user clicks 'Yes'
    Then the album is removed
    And the playlist now shows three albums

  Scenario: User cancels the removal of an album
    Given the user is viewing a playlist with albums
    When the user clicks the delete icon on an album
    And the confirmation dialog appears
    And the user clicks 'Cancel'
    Then the album remains in the playlist unchanged

  Scenario: User removes all albums from a playlist
    Given the user has a playlist with albums
    When the user removes each album from their playlist one by one until no albums remain
    Then the playlist still exists
    And the playlist displays an empty state message like 'No albums yet. Add one to get started.'
```

### Story 9218132: Edit Playlist Name and Description

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 13:10 UTC

```gherkin
Feature: Edit Playlist Name and Description

  Scenario: User edits the playlist name
    Given the user has a playlist titled 'Summer Road Trip'
    When the user opens their playlist
    And the user clicks an edit button
    And the name field becomes editable
    And the user changes it to 'Summer 2024 Road Trip'
    And the user clicks 'Save'
    Then the playlist title updates immediately

  Scenario: User edits the playlist description
    Given the user has a playlist with a description
    When the user opens their playlist
    And the user clicks edit
    And the description field is now editable
    And the user updates it from 'Feel-good tracks for long drives' to 'Upbeat, energetic tracks perfect for long summer drives with friends'
    And the user clicks 'Save'
    Then the description updates

  Scenario: User clears the playlist description
    Given the user is editing their playlist
    When the user deletes the description text, leaving it blank
    And the user clicks 'Save'
    Then the playlist now has no description

  Scenario: User attempts to save a playlist with an empty name
    Given the user is editing their playlist
    When the user accidentally clears the name field
    And the user clicks 'Save'
    Then an error message appears stating 'Playlist name is required'
    And the form remains open
    And the user can enter a name
```

### Story 9218133: View Playlists in List

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 13:10 UTC

```gherkin
Feature: View Playlists in List

  Scenario: User views their playlists library
    Given the user has created multiple playlists
    When the user navigates to their profile
    And the user clicks on 'My Playlists'
    Then a list appears showing all playlists they have created
    And each playlist displays a thumbnail, title, and number of albums
    And the user can see 'Summer Road Trip' (4 albums), 'Breakup Anthems' (3 albums), and 'Late Night Jazz' (6 albums)

  Scenario: User with no playlists views the playlists section
    Given the user is a new user with no playlists
    When the user navigates to their playlists section
    Then an empty state message appears saying 'You haven't created any playlists yet. Create one to get started!'
    And a button to create a new playlist is displayed

  Scenario: User clicks on a playlist from the list
    Given the user is viewing their playlists list
    When the user clicks on 'Breakup Anthems'
    Then the user is taken to that playlist's detail view
    And the user can see all the albums
    And the user can see the description
    And the user can see options to edit or add more albums
```

### Story 9218134: Delete Playlist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 13:10 UTC

```gherkin
Feature: Delete Playlist

  Scenario: User deletes a playlist
    Given the user is viewing their playlists list
    When the user clicks a delete icon on the 'Old Playlist' entry
    And a confirmation dialog appears asking 'Are you sure you want to delete this playlist? This action cannot be undone.'
    And the user clicks 'Delete'
    Then the playlist is removed from their list

  Scenario: User cancels playlist deletion
    Given the user is viewing their playlists list
    When the user clicks the delete icon on a playlist
    And the confirmation dialog appears
    And the user clicks 'Cancel'
    Then the playlist remains in their library unchanged

  Scenario: User deletes a playlist from within the playlist view
    Given the user is viewing the contents of a playlist
    When the user clicks a menu or settings option
    And a 'Delete Playlist' option appears
    And the user clicks it
    And the user confirms the deletion
    Then the user is returned to their playlists list
    And the deleted playlist no longer appears
```

### Story 9218135: View Album Count in Playlists

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 13:10 UTC

```gherkin
Feature: View Album Count in Playlists

  Scenario: User views album count on playlists list
    Given the user is viewing their playlists library
    When the user looks at the playlist cards
    Then each playlist card displays the title and a count like '4 albums', '3 albums', or '6 albums'
    And the count is displayed below or next to the title

  Scenario: User sees album count update after adding an album
    Given the user is viewing their playlists list which shows 'Summer Road Trip (4 albums)'
    When the user opens that playlist
    And the user adds a new album
    And the user returns to the list
    Then the count now shows '5 albums'

  Scenario: User sees album count update after removing an album
    Given the user is viewing their playlists list which shows 'Breakup Anthems (3 albums)'
    When the user opens that playlist
    And the user removes one album
    And the user returns to the list
    Then the count now shows '2 albums'
```

## Epic 354335: Create Songs

### Story 9218674: Upload Audio File for Song

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 14:49 UTC

```gherkin
Feature: Upload Audio File for Song

  Scenario: Successfully upload a supported audio file
    Given a user has selected an MP3 file from their device
    When the user uploads the file
    Then the system accepts the file
    And the system stores the file
    And the system confirms the upload is complete
    And the user sees a success message
    And the audio file is associated with the user's account

  Scenario: Attempt to upload an unsupported file format
    Given a user has selected a text file or image file
    When the user attempts to upload the file
    Then the system rejects the upload
    And the system displays a clear error message
    And the error message explains which audio formats are supported (MP3, WAV, FLAC)

  Scenario: Upload a file that exceeds the size limit
    Given a user has selected an audio file larger than the platform's maximum allowed size
    When the user attempts to upload the file
    Then the system rejects the upload
    And the system informs the user of the size limit
    And the system suggests ways to compress or re-encode the file
```

### Story 9218676: Enter Basic Song Metadata

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 14:49 UTC

```gherkin
Feature: Enter Basic Song Metadata

  Scenario: Successfully add song title and artist name
    Given a user has access to dedicated metadata entry fields
    When the user enters a song title and artist name
    Then the system saves this information
    And the information is displayed on the song's profile page

  Scenario: Submit a song with missing required metadata
    Given a user has left the title field empty
    When the user attempts to save the song
    Then the system prevents submission
    And the system highlights the missing required field
    And the system displays a clear message indicating the field is required

  Scenario: Add optional metadata like genre and release date
    Given a user has access to optional metadata fields
    When the user fills in optional fields such as genre, release date, and album name
    Then the system saves all provided information
    And the system uses the information to enhance discoverability
```

### Story 9218680: Set Cover Image for Song

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 14:49 UTC

```gherkin
Feature: Set Cover Image for Song

  Scenario: Successfully upload a cover image
    Given a user has selected a JPG or PNG image from their device
    When the user uploads the image as the song's cover art
    Then the system displays the image on the song's profile
    And the system displays the image in search results

  Scenario: Attempt to upload an invalid image file
    Given a user has selected a non-image file
    When the user attempts to upload it as cover art
    Then the system rejects the upload
    And the system prompts the user to upload a valid image format

  Scenario: Skip cover image upload
    Given a user has chosen not to upload a cover image
    When the user proceeds to publish the song
    Then the system assigns a default placeholder image
    And the song is published without cover art
```

### Story 9218681: Publish Song to Community

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 14:49 UTC

```gherkin
Feature: Publish Song to Community

  Scenario: Successfully publish a song with all required information
    Given a user has completed all required fields (title, artist, audio file)
    When the user clicks publish
    Then the system validates the submission
    And the system makes the song visible on the platform
    And the system shows a confirmation message

  Scenario: Attempt to publish a song with incomplete information
    Given a user has not completed all required fields
    When the user clicks publish
    Then the system displays validation errors
    And the system highlights which fields are missing
    And the system prevents publication

  Scenario: Publish a song and receive a shareable link
    Given a user has successfully published a song
    When the publication is complete
    Then the user receives a unique URL
    And the user can share the URL with others to view and listen to the song
```

### Story 9218682: Edit Published Song Details

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 14:49 UTC

```gherkin
Feature: Edit Published Song Details

  Scenario: Successfully update song title and metadata
    Given a user has navigated to their published song
    And the user has clicked edit
    When the user changes the title and genre
    And the user saves the changes
    Then the changes appear immediately on the song's profile
    And the changes appear in search results

  Scenario: Attempt to remove required metadata during editing
    Given a user is editing a published song
    When the user tries to clear the song title field
    And the user attempts to save
    Then the system prevents the save
    And the system displays a validation error
    And the system requires the title field to remain populated

  Scenario: Replace the cover image
    Given a user is editing a published song with an existing cover image
    When the user uploads a new cover image
    Then the system updates the image
    And the new image appears across all pages where the song appears
```

### Story 9218683: Delete Song from Platform

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 14:49 UTC

```gherkin
Feature: Delete Song from Platform

  Scenario: Successfully delete a song after confirmation
    Given a user has navigated to their song
    When the user clicks delete
    And the user sees a confirmation dialog warning that the action is permanent
    And the user confirms the deletion
    Then the song is removed from the platform
    And the user is redirected to their profile

  Scenario: Cancel song deletion
    Given a user has initiated song deletion
    And the user sees the confirmation dialog
    When the user clicks cancel
    Then the song remains on the platform unchanged

  Scenario: Delete a song that appears in community lists
    Given a user has a song that other users have added to their lists
    When the user deletes the song
    Then the system removes the song from the platform
    And the system notifies affected users that a song in their list is no longer available
```

### Story 9218684: View Song Analytics and Engagement

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 14:49 UTC

```gherkin
Feature: View Song Analytics and Engagement

  Scenario: View play count and listener statistics
    Given a user has navigated to their song's analytics dashboard
    When the dashboard loads
    Then the user sees the total number of plays
    And the user sees the number of unique listeners
    And the user sees a graph showing plays over time

  Scenario: View review and rating summary
    Given a user is viewing their song's analytics
    When the user accesses the review and rating section
    Then the user sees the average star rating
    And the user sees the total number of reviews
    And the user sees a breakdown of rating distribution (e.g., 5-star vs 1-star reviews)

  Scenario: Check list inclusion data
    Given a user is viewing their song's analytics
    When the user accesses the list inclusion section
    Then the user sees how many community lists their song appears in
    And the user can view a sample of those lists
    And the user understands how their music is being categorized
```

## Epic 354435: Create Playlists

### Story 9220322: Create New Empty Playlist With Metadata

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:12 UTC

```gherkin
Feature: Create New Empty Playlist With Metadata

  Scenario: Successfully create a playlist with title and description
    Given the user is on the playlist creation interface
    When the user enters a title 'Late Night Jazz Sessions'
    And the user enters a description 'Smooth jazz for unwinding after midnight'
    And the user taps Create
    Then the system confirms the playlist was created
    And the playlist appears in the user's playlist library
    And the title is visible in the playlist library
    And the description is visible in the playlist library

  Scenario: Create a playlist with only a title
    Given the user is on the playlist creation interface
    When the user enters a title
    And the user leaves the description field empty
    And the user taps Create
    Then the system creates the playlist successfully
    And the playlist is displayed with the title
    And the playlist displays with no description text

  Scenario: Attempt to create a playlist without a title
    Given the user is on the playlist creation interface
    When the user leaves the title field empty
    And the user attempts to submit the playlist creation form
    Then the system shows an error message indicating a title is required
    And the playlist creation is prevented
    And the form remains open for the user to enter a title
```

### Story 9220323: Add Albums or Tracks to Playlist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:12 UTC

```gherkin
Feature: Add Albums or Tracks to Playlist

  Scenario: Successfully add an album to a playlist
    Given the user has logged an album in LinerNotes
    And the user has at least one existing playlist
    When the user navigates to the album
    And the user taps the 'Add to Playlist' button
    And the user selects a playlist from the dropdown
    And the user confirms the action
    Then the album appears in the selected playlist
    And all tracks from the album are included in the playlist

  Scenario: Successfully add individual tracks to a playlist
    Given the user has logged albums in their library
    And the user has at least one existing playlist
    When the user browses their logged albums
    And the user finds a specific track
    And the user taps 'Add to Playlist'
    And the user selects a destination playlist
    And the user confirms the action
    Then the single track is added to the playlist
    And the entire album is not added to the playlist

  Scenario: Add the same album to multiple playlists
    Given the user has an album logged in LinerNotes
    And the user has created multiple playlists
    When the user adds the album to the first playlist
    And the user later adds the same album to a different playlist
    Then the album appears in the first playlist
    And the album appears in the second playlist
    And the user can see the album listed in each playlist

  Scenario: Attempt to add a track that is already in the playlist
    Given the user has a playlist with an existing track
    When the user attempts to add the same track to the playlist
    Then the system either prevents the duplicate addition with a message or allows it and the track appears twice in the playlist
```

### Story 9220324: Reorder Tracks or Albums Within Playlist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:12 UTC

```gherkin
Feature: Reorder Tracks or Albums Within Playlist

  Scenario: Successfully reorder tracks by dragging
    Given the user has a playlist with multiple tracks
    When the user opens the playlist
    And the user long-presses or drags a track to a new position
    And the user releases the track
    Then the track moves to the new position
    And the playlist order is updated and saved

  Scenario: Move a track to the top of the playlist
    Given the user has a playlist with multiple tracks
    When the user drags a track from the middle or bottom to the first position
    Then the track appears at the top of the playlist
    And all other tracks shift down accordingly

  Scenario: Attempt to reorder when playlist has only one track
    Given the user has a playlist with a single track
    When the user opens the playlist
    Then the reordering controls are either disabled or the user cannot meaningfully change the order
    And the track remains in its only position
```

### Story 9220325: Remove Tracks or Albums From Playlist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:12 UTC

```gherkin
Feature: Remove Tracks or Albums From Playlist

  Scenario: Successfully remove a track from a playlist
    Given the user has a playlist with multiple tracks
    When the user opens the playlist
    And the user swipes or taps a delete icon next to a track
    And the user confirms the removal
    Then the track disappears from the playlist
    And the remaining tracks stay in order

  Scenario: Successfully remove an entire album from a playlist
    Given the user has a playlist containing an album they previously added
    When the user removes the album
    Then all tracks from that album are removed from the playlist in one action

  Scenario: Attempt to remove a track and then undo
    Given the user has a playlist with multiple tracks
    When the user removes a track
    And the user immediately taps the undo option
    Then the track is restored to its previous position in the playlist

  Scenario: Remove all tracks from a playlist
    Given the user has a playlist with multiple tracks
    When the user removes tracks one by one until the playlist is empty
    Then the playlist still exists
    And the playlist displays as empty with a message like 'No tracks yet'
```

### Story 9220326: Edit Playlist Title and Description

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:12 UTC

```gherkin
Feature: Edit Playlist Title and Description

  Scenario: Successfully update playlist title
    Given the user owns a playlist with the title 'Late Night Jazz'
    When the user opens the playlist
    And the user taps an edit button
    And the user changes the title to 'Midnight Jazz Vibes'
    And the user saves the changes
    Then the new title appears throughout the app

  Scenario: Successfully update playlist description
    Given the user owns a playlist
    When the user edits the playlist
    And the user updates the description to add more context or change the theme explanation
    And the user saves the changes
    Then the updated description is saved
    And the updated description is displayed

  Scenario: Clear the playlist description
    Given the user owns a playlist with a description
    When the user edits the playlist
    And the user removes all text from the description field
    And the user saves the changes
    Then the playlist now has no description
    And the description area appears empty or shows a placeholder

  Scenario: Attempt to change title to empty string
    Given the user is editing a playlist
    When the user clears the title field
    And the user attempts to save the playlist
    Then the system shows an error
    And the save is prevented until a title is provided
```

### Story 9220327: View All Playlists in One Place

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:12 UTC

```gherkin
Feature: View All Playlists in One Place

  Scenario: View a list of all created playlists
    Given the user has created multiple playlists
    When the user navigates to their Playlists section
    Then the user sees a list of all playlists they have created
    And each playlist shows the title
    And each playlist shows the description
    And each playlist shows the track count

  Scenario: View playlists when none have been created yet
    Given the user is new and has not created any playlists
    When the user navigates to the Playlists section
    Then the app displays an empty state message like 'No playlists yet'
    And a button to create a playlist is displayed

  Scenario: View playlists sorted by creation date
    Given the user has created multiple playlists at different times
    When the user navigates to the Playlists section
    Then the playlists are displayed in a default order such as most recently created first
    And the order is consistent and predictable
```

### Story 9220328: Delete a Playlist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:12 UTC

```gherkin
Feature: Delete a Playlist

  Scenario: Successfully delete a playlist
    Given the user has a playlist
    When the user opens the playlist
    And the user taps a delete or remove option
    And the user confirms the action in a confirmation dialog
    Then the playlist is permanently removed from the user's library

  Scenario: Attempt to delete a playlist and cancel
    Given the user has a playlist
    When the user initiates deletion
    And the user sees a confirmation prompt asking 'Are you sure?'
    And the user taps Cancel
    Then the playlist remains intact

  Scenario: Delete a playlist with many tracks
    Given the user has a playlist containing dozens of tracks
    When the user deletes the playlist
    Then the entire playlist and all its contents are removed in one action
    And the original albums or tracks in the user's library are not affected
```

### Story 9220329: View Details of Specific Playlist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:12 UTC

```gherkin
Feature: View Details of Specific Playlist

  Scenario: Open a playlist and view all its contents
    Given the user has a playlist with tracks or albums
    When the user taps on the playlist from their library
    Then the app displays the playlist title
    And the app displays the playlist description
    And the app displays a complete list of all tracks or albums in order
    And the app displays metadata like track count
    And the app displays metadata like total duration

  Scenario: View an empty playlist
    Given the user has created a playlist but has not added tracks to it
    When the user opens the playlist
    Then the app shows the title and description
    And an empty state message is displayed
    And a button to add tracks is displayed

  Scenario: View a playlist with mixed albums and individual tracks
    Given the user has a playlist containing both full albums and individual tracks added separately
    When the user opens the playlist
    Then the app clearly displays the structure
    And the app shows which tracks belong to which albums
    And the app shows which tracks are standalone additions
```

## Epic 354437: Album Logging and Cataloging

### Story 9220359: Search Albums by Title or Artist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:36 UTC

```gherkin
Feature: Search Albums by Title or Artist

  Scenario: Successful album search by title
    Given the user has opened the search interface
    When the user types 'Rumours' in the search field
    Then a list of albums matching that title is displayed
    And each result shows album artwork, artist name, and release year
    And the user can click on the correct album (Fleetwood Mac, 1977) to view its details

  Scenario: Successful album search by artist name
    Given the user has opened the search interface
    When the user types 'The Beatles' in the search field
    Then a list of all albums by that artist is displayed
    And results are sorted by release date
    And the user can select a specific album like 'Abbey Road'

  Scenario: Search returns no results
    Given the user has opened the search interface
    When the user searches for a very obscure or misspelled album name
    Then a message is displayed indicating no albums were found
    And suggestions appear to try different search terms or check the spelling

  Scenario: Search with partial or fuzzy matching
    Given the user has opened the search interface
    When the user types 'Rumor' (missing the 's')
    Then 'Rumours' by Fleetwood Mac is returned as a top result
    And intelligent fuzzy matching is demonstrated
```

### Story 9220360: Add Album to Library from Search

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:36 UTC

```gherkin
Feature: Add Album to Library from Search

  Scenario: Successful album addition to library
    Given the user has found 'Rumours' by Fleetwood Mac in search results
    When the user clicks 'Add to Library'
    Then the album is immediately added to their collection
    And a confirmation message appears
    And the album now appears in their library view

  Scenario: Album already in library
    Given the user has already cataloged an album
    When the user attempts to add that album again
    Then the system recognizes the duplicate
    And a message is displayed indicating the album is already in their library
    And an option is offered to take them to the existing entry

  Scenario: Add album with incomplete metadata
    Given an album has minimal metadata available (e.g., missing release year or artwork)
    When the user adds that album
    Then the system allows the addition
    And whatever metadata is available is displayed
    And placeholder text appears for missing fields
```

### Story 9220361: Mark Album as Owned or Wishlist

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:36 UTC

```gherkin
Feature: Mark Album as Owned or Wishlist

  Scenario: Mark album as owned
    Given the user is viewing an album in their library
    When the user clicks a toggle or button to mark it as 'Owned'
    Then the album's status updates immediately
    And a visual indicator (e.g., a checkmark or label) appears to show ownership status

  Scenario: Move album to wishlist
    Given the user is viewing an album in their library
    When the user marks an album as 'Wishlist'
    Then the album remains in their library
    And the album is visually distinguished or can be filtered separately
    And wishlist items can be shown in a filtered view

  Scenario: Change ownership status
    Given the user has marked an album as 'Wishlist'
    When the user later changes it to 'Owned' after purchasing it
    Then the status updates without requiring the album to be re-added

  Scenario: Default status on album addition
    Given the user is adding an album to their library
    When the album addition process completes
    Then the user is prompted or the system defaults to a status (e.g., 'Owned' or 'Wishlist')
    And the user can confirm or change this status before finalizing the addition
```

### Story 9220362: View Music Library with Filtering and Sorting

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:36 UTC

```gherkin
Feature: View Music Library with Filtering and Sorting

  Scenario: View all albums in library
    Given the user has added albums to their library
    When the user navigates to their library
    Then all albums are displayed in a grid or list view
    And each album shows artwork, title, artist, and ownership status
    And the view loads smoothly even with a large collection

  Scenario: Filter library by ownership status
    Given the user is viewing their library
    When the user applies a filter to show only 'Owned' albums or only 'Wishlist' items
    Then the library updates to display only albums matching the selected filter

  Scenario: Sort library by different criteria
    Given the user is viewing their library
    When the user selects a sort option (album title A-Z, artist name, date added, or release year)
    Then the library re-orders accordingly

  Scenario: Search within library
    Given the user is viewing their library
    When the user types in a search box within the library view
    Then results update in real-time as they type
    And the user can quickly find a specific album without leaving the library interface

  Scenario: Empty library state
    Given a new user has no albums in their library
    When the user navigates to their library
    Then a friendly message appears encouraging them to start adding albums
    And a link to the search interface is provided
```

### Story 9220363: View Detailed Album Metadata

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:36 UTC

```gherkin
Feature: View Detailed Album Metadata

  Scenario: View album details page
    Given the user is viewing their library
    When the user clicks on an album
    Then a detailed view is displayed including album artwork, title, artist, release year, genre, record label, and track listing
    And all available metadata is clearly displayed

  Scenario: View album with missing metadata
    Given an album has some metadata fields unavailable (e.g., no genre or label information)
    When the user views that album's details page
    Then the system gracefully handles missing data by showing placeholder text or omitting empty fields
    And the layout does not break

  Scenario: View track listing
    Given the user is viewing an album's details page
    When the user scrolls through the page
    Then a complete track listing is displayed with song titles and durations
    And the track list is clearly formatted and easy to read
```

### Story 9220364: Log Album Listening History

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:36 UTC

```gherkin
Feature: Log Album Listening History

  Scenario: Log a listen with current date
    Given the user has just finished listening to an album
    When the user clicks 'Log Listen'
    Then the system records the current date and time
    And the listen is added to their listening history
    And a confirmation message appears

  Scenario: Log a listen with custom date
    Given the user wants to log a listen for an album they heard in the past
    When the user clicks 'Log Listen' and selects a custom date from a date picker
    Then the system records the listen for that date

  Scenario: View listening history for an album
    Given the user is viewing an album's details page
    When the user looks at the listening history section
    Then a timeline or list of all logged listens for that album is displayed
    And the frequency of listening is shown

  Scenario: Log multiple listens on same day
    Given the user has listened to the same album multiple times on the same day
    When the user logs multiple listens for that album on that day
    Then the system allows this
    And both entries are displayed in the listening history

  Scenario: View overall listening history
    Given the user has logged listens for multiple albums
    When the user navigates to a 'Listening History' or 'Timeline' view
    Then all logged listens across all albums are displayed in chronological order
    And the user can see their listening patterns over time
```

### Story 9220365: Remove Album from Library

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:36 UTC

```gherkin
Feature: Remove Album from Library

  Scenario: Successfully remove album from library
    Given the user is viewing an album's details page
    When the user clicks a 'Remove from Library' button and confirms the action in a confirmation dialog
    Then the album is immediately removed from their library
    And the album no longer appears in their collection

  Scenario: Confirmation before deletion
    Given the user is viewing an album's details page
    When the user clicks 'Remove from Library'
    Then a confirmation dialog appears asking 'Are you sure?'
    And the user can cancel or confirm the action

  Scenario: Remove album with associated data
    Given the user is removing an album that has reviews, ratings, or listen logs associated with it
    When the user confirms the removal
    Then the system handles this gracefully by either preserving the review/rating data separately or clearly communicating what will be deleted
```

### Story 9220366: Track Album Addition Date

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:36 UTC

```gherkin
Feature: Track Album Addition Date

  Scenario: View date added on album details
    Given the user is viewing an album's details page
    When the user looks at the album information
    Then a 'Date Added' field is visible showing when they added the album to their library (e.g., 'Added on March 15, 2024')

  Scenario: View date added in library list
    Given the user is viewing their library in list view
    When the user looks at the library entries
    Then the date each album was added is visible, either as a column or visible metadata for each entry

  Scenario: Sort by date added
    Given the user is viewing their library
    When the user sorts their library by 'Date Added'
    Then the most recent additions appear first or oldest additions appear first
    And the user can track collection growth
```

### Story 9220367: Assign Star Rating to Album

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:37 UTC

```gherkin
Feature: Assign Star Rating to Album

  Scenario: Assign star rating to album
    Given the user is viewing an album
    When the user clicks on a star rating widget (e.g., 1-5 stars) and selects their desired rating (e.g., 4 stars)
    Then the rating is immediately saved
    And the rating is displayed on the album

  Scenario: Update existing rating
    Given the user has previously rated an album 3 stars
    When the user clicks the rating widget again and selects a new rating (e.g., 5 stars)
    Then the new rating overwrites the previous one

  Scenario: Remove rating
    Given the user has assigned a star rating to an album
    When the user clicks on their existing star rating to deselect it
    Then the rating is removed entirely
    And the album no longer shows a rating until they assign one again

  Scenario: View rating on album card
    Given the user is viewing their library
    When the user looks at the album cards
    Then each album displays its star rating prominently (e.g., as filled stars)
    And the user can quickly see their rated albums at a glance
```

### Story 9220368: Add Custom Notes and Tags to Album

**Status:** Gherkin Locked  
**Locked at:** 2026-05-04 23:37 UTC

```gherkin
Feature: Add Custom Notes and Tags to Album

  Scenario: Add personal notes to album
    Given the user is viewing an album's details page
    When the user clicks an 'Add Notes' field and types a personal note (e.g., 'Listened to this on my road trip to Colorado')
    Then the note is saved
    And the note is displayed on the album's page

  Scenario: Edit existing notes
    Given the user has added notes to an album
    When the user clicks on their existing notes and edits them
    Then the changes are saved immediately

  Scenario: Add tags to album
    Given the user is viewing an album's details page
    When the user adds tags to an album (e.g., 'road-trip', 'summer-2024', 'favorites')
    Then tags appear as clickable labels on the album
    And tags can be used for filtering or discovery

  Scenario: Filter library by tags
    Given the user is viewing their library
    When the user clicks on a tag (e.g., 'summer-2024')
    Then the library filters to show only albums with that tag
    And the user can rediscover music from specific periods or contexts

  Scenario: View notes with character limit
    Given the notes field has a reasonable character limit (e.g., 500 characters)
    When the user tries to exceed the character limit
    Then the system prevents further input or warns them they're at the limit
```
